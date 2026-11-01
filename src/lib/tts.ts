import type { ApiError, TtsRequest, TtsResponse, Voice, VoicesResponse } from "../../shared/api";
import { cacheKey } from "../../shared/cache-key";
import { GoogleTtsError, listVoices as googleListVoices, synthesize as googleSynthesize } from "../../shared/google";
import { clipsDb } from "./db";
import { validateTtsRequest } from "../../shared/validate";
import { HttpError, isRateLimit, OfflineError, PendingError, QuotaError, withRetry } from "./retry";
import { getSettings, updateSettings } from "./settings";

export type Mode = "own-key" | "server";

export function currentMode(): Mode {
  return getSettings().apiKey ? "own-key" : "server";
}

/** Rewrites raw errors into something actionable for the current mode. */
function explain(err: unknown, mode: Mode): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (isRateLimit(err)) {
    return new QuotaError("Google's usage limit is still reached. Wait a minute and try again, or raise the Text-to-Speech quota in Google Cloud.");
  }
  if (mode === "server" && /Cloudflare Access|Unauthorized|401/.test(message)) {
    return new Error("No API key set. Add your own Google API key in Settings, or sign in to the Parrot server.");
  }
  if (err instanceof GoogleTtsError) {
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
      return new Error("The Cloud Text-to-Speech API isn't enabled for this key's project. Enable it in the Google Cloud console.");
    }
    if (/billing/i.test(message)) return new Error("Billing isn't enabled on this key's Google Cloud project.");
    if (/API key not valid|API_KEY_INVALID/i.test(message)) return new Error("Google rejected the API key. Check it in Settings.");
    if (/referer|referrer/i.test(message)) {
      return new Error("This key's website restriction doesn't allow this site. Add this site's address to the key's allowed referrers.");
    }
    return new Error(`Google TTS: ${message}`);
  }
  return err instanceof Error ? err : new Error(message);
}

async function serverCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) throw new HttpError((body as ApiError | null)?.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const voiceCache = new Map<string, Promise<Voice[]>>();

// Google's voice list rarely changes; refetching it on every app open would
// spend quota ("All requests per minute") for nothing.
export const VOICES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredVoices {
  at: number;
  voices: Voice[];
}

function storedVoices(languageCode: string): StoredVoices | null {
  try {
    const raw = JSON.parse(localStorage.getItem(`parrot:voices:${languageCode}`) ?? "null") as StoredVoices | Voice[] | null;
    if (!raw) return null;
    // Older versions stored a bare array: usable offline, but treated as stale.
    return Array.isArray(raw) ? { at: 0, voices: raw } : raw;
  } catch {
    return null;
  }
}

function storeVoices(languageCode: string, voices: Voice[]): void {
  try {
    localStorage.setItem(`parrot:voices:${languageCode}`, JSON.stringify({ at: Date.now(), voices } satisfies StoredVoices));
  } catch {
    // Not critical: only saves a request next time.
  }
}

/**
 * Google's voices for a language. Uses the copy saved on this device when it's
 * under a week old (`refresh` forces a new one), and falls back to any saved
 * copy when offline.
 */
export function listVoices(languageCode: string, { refresh = false }: { refresh?: boolean } = {}): Promise<Voice[]> {
  const mode = currentMode();
  const key = `${mode}:${getSettings().apiKey.slice(-6)}:${languageCode}`;
  const saved = storedVoices(languageCode);
  if (!refresh && saved && Date.now() - saved.at < VOICES_MAX_AGE_MS && saved.voices.length > 0) {
    return Promise.resolve(saved.voices);
  }
  let voices = refresh ? undefined : voiceCache.get(key);
  if (!voices) {
    voices = (
      mode === "own-key"
        ? googleListVoices(languageCode, getSettings().apiKey)
        : serverCall<VoicesResponse>(`/api/voices?lang=${encodeURIComponent(languageCode)}`).then((r) => r.voices)
    ).then(
      (list) => {
        storeVoices(languageCode, list);
        return list;
      },
      (err: unknown) => {
        voiceCache.delete(key);
        const stored = storedVoices(languageCode);
        if (stored && !refresh) return stored.voices;
        throw explain(err, mode);
      },
    );
    voiceCache.set(key, voices);
  }
  return voices;
}

// Rough quality ranking; the best available family is the default voice.
export const FAMILY_ORDER = ["Chirp3-HD", "Chirp-HD", "Studio", "Neural2", "Wavenet", "Polyglot", "Standard"];

export function familyRank(family: string): number {
  const i = FAMILY_ORDER.indexOf(family);
  return i === -1 ? FAMILY_ORDER.length : i;
}

/** The user's chosen voice for a language, or the best-ranked one available. */
export async function resolveVoice(languageCode: string): Promise<string> {
  const chosen = getSettings().voices[languageCode];
  if (chosen) return chosen;
  const voices = await listVoices(languageCode);
  if (voices.length === 0) throw new Error(`No Google voices found for ${languageCode}`);
  const best = [...voices].sort((a, b) => familyRank(a.family) - familyRank(b.family) || a.name.localeCompare(b.name))[0].name;
  // Lock it in: if Google later adds a voice that ranks higher, switching would
  // silently change every clip's cache key and re-download all your lists.
  if (!getSettings().voices[languageCode]) updateSettings({ voices: { ...getSettings().voices, [languageCode]: best } });
  return best;
}

export interface Clip {
  hash: string;
  blob: Blob;
  cached: boolean;
}

const inflight = new Map<string, Promise<Clip>>();

// Google allows 200 Chirp 3 HD requests per minute by default. Spacing requests
// ~330 ms apart (about 180 a minute) keeps big downloads under that limit.
const MIN_REQUEST_GAP_MS = 330;
let nextRequestAt = 0;

/** Waits for this client's next request slot. */
function paceRequest(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + MIN_REQUEST_GAP_MS;
  return at > now ? new Promise((r) => setTimeout(r, at - now)) : Promise.resolve();
}

export interface GetClipOptions {
  /** Called when Google's quota is hit and the download pauses before retrying. */
  onWait?: (ms: number) => void;
  /** Wait out quota errors (default). Off = fail fast so a session can start with what's ready. */
  retry?: boolean;
}

/** Returns audio for a request: from IndexedDB if we have it, otherwise synthesized and stored. */
export async function getClip(raw: Required<TtsRequest>, { onWait, retry = true }: GetClipOptions = {}): Promise<Clip> {
  // Normalize exactly like the server (Unicode form, spacing, rounded speed), so the
  // same words always map to the same cached clip here, in R2 and at Google.
  const valid = validateTtsRequest(raw);
  if (!valid.ok) throw new Error(valid.error);
  const req = valid.value;
  const hash = await cacheKey(req);
  const existing = inflight.get(hash);
  if (existing) {
    // A caller that can't wait (a session starting now) doesn't join a slow background download.
    if (!retry) throw new PendingError("This audio is still downloading.");
    return existing;
  }

  const promise = (async (): Promise<Clip> => {
    const local = await clipsDb.get(hash);
    if (local) return { hash, blob: local, cached: true };

    const mode = currentMode();
    let blob: Blob;
    try {
      blob = await withRetry(async () => {
        await paceRequest();
        if (mode === "own-key") {
          const bytes = await googleSynthesize(req, getSettings().apiKey);
          return new Blob([bytes as BlobPart], { type: "audio/mpeg" });
        }
        const res = await serverCall<TtsResponse>("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const audio = await fetch(res.url);
        if (!audio.ok) throw new HttpError(`Could not download audio (${audio.status})`, audio.status);
        return audio.blob();
      }, { onWait, delays: retry ? undefined : [] });
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        throw new OfflineError("Some audio isn't downloaded yet, and you're offline. Connect once to download it.");
      }
      throw explain(err, mode);
    }
    await clipsDb.put(hash, blob);
    return { hash, blob, cached: false };
  })().finally(() => inflight.delete(hash));

  inflight.set(hash, promise);
  return promise;
}

/** Fetches many clips with limited concurrency. Stops at the first error. */
export async function getClips(
  reqs: Required<TtsRequest>[],
  onProgress: (done: number, total: number, waiting?: boolean) => void,
  concurrency = 3,
): Promise<Clip[]> {
  const results: Clip[] = new Array(reqs.length);
  let next = 0;
  let done = 0;
  let failed: unknown;
  onProgress(0, reqs.length);

  async function worker() {
    while (next < reqs.length && failed === undefined) {
      const i = next++;
      try {
        results[i] = await getClip(reqs[i], { onWait: () => onProgress(done, reqs.length, true) });
      } catch (err) {
        failed ??= err;
        return;
      }
      onProgress(++done, reqs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, reqs.length) }, worker));
  if (failed !== undefined) throw failed;
  return results;
}

export interface SettledClips {
  /** Clips that are ready, by index into the request list. */
  clips: Map<number, Clip>;
  /** Indexes that couldn't be fetched. */
  failed: Set<number>;
  /** The first error, to explain why. */
  error?: unknown;
}

/**
 * Like getClips, but keeps going past failures and reports what's ready.
 * After a quota or offline error it stops sending requests (they'd fail too)
 * and marks the rest as failed.
 */
export async function getClipsSettled(
  reqs: Required<TtsRequest>[],
  onProgress: (done: number, total: number, waiting?: boolean) => void,
  { retry = true, concurrency = 3 }: { retry?: boolean; concurrency?: number } = {},
): Promise<SettledClips> {
  const clips = new Map<number, Clip>();
  const failed = new Set<number>();
  let error: unknown;
  let stop = false;
  let next = 0;
  let done = 0;
  onProgress(0, reqs.length);

  async function worker() {
    while (next < reqs.length) {
      const i = next++;
      if (stop) {
        failed.add(i);
        continue;
      }
      try {
        clips.set(i, await getClip(reqs[i], { retry, onWait: () => onProgress(done, reqs.length, true) }));
      } catch (err) {
        failed.add(i);
        error ??= err;
        if (err instanceof QuotaError || err instanceof OfflineError) stop = true;
      }
      onProgress(++done, reqs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, reqs.length) }, worker));
  return { clips, failed, error };
}

/** The cache key a request is stored under (after the same normalization as getClip). */
export async function clipKey(req: Required<TtsRequest>): Promise<string> {
  const valid = validateTtsRequest(req);
  return cacheKey(valid.ok ? valid.value : req);
}

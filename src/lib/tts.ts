import type { ApiError, TtsRequest, TtsResponse, Voice, VoicesResponse } from "../../shared/api";
import { cacheKey } from "../../shared/cache-key";
import { GoogleTtsError, listVoices as googleListVoices, synthesize as googleSynthesize } from "../../shared/google";
import { clipsDb } from "./db";
import { getSettings } from "./settings";

export type Mode = "own-key" | "server";

export function currentMode(): Mode {
  return getSettings().apiKey ? "own-key" : "server";
}

/** Rewrites raw errors into something actionable for the current mode. */
function explain(err: unknown, mode: Mode): Error {
  const message = err instanceof Error ? err.message : String(err);
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
  if (!res.ok) throw new Error((body as ApiError | null)?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const voiceCache = new Map<string, Promise<Voice[]>>();

function storedVoices(languageCode: string): Voice[] | null {
  try {
    return JSON.parse(localStorage.getItem(`parrot:voices:${languageCode}`) ?? "null") as Voice[] | null;
  } catch {
    return null;
  }
}

function storeVoices(languageCode: string, voices: Voice[]): void {
  try {
    localStorage.setItem(`parrot:voices:${languageCode}`, JSON.stringify(voices));
  } catch {
    // Not critical: only needed offline.
  }
}

/** Google's voices for a language. Falls back to the last list seen, so it works offline. */
export function listVoices(languageCode: string): Promise<Voice[]> {
  const mode = currentMode();
  const key = `${mode}:${getSettings().apiKey.slice(-6)}:${languageCode}`;
  let voices = voiceCache.get(key);
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
        if (stored) return stored;
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
  return [...voices].sort((a, b) => familyRank(a.family) - familyRank(b.family) || a.name.localeCompare(b.name))[0].name;
}

export interface Clip {
  hash: string;
  blob: Blob;
  cached: boolean;
}

const inflight = new Map<string, Promise<Clip>>();

/** Returns audio for a request: from IndexedDB if we have it, otherwise synthesized and stored. */
export async function getClip(req: Required<TtsRequest>): Promise<Clip> {
  const hash = await cacheKey(req);
  const existing = inflight.get(hash);
  if (existing) return existing;

  const promise = (async (): Promise<Clip> => {
    const local = await clipsDb.get(hash);
    if (local) return { hash, blob: local, cached: true };

    const mode = currentMode();
    let blob: Blob;
    try {
      if (mode === "own-key") {
        const bytes = await googleSynthesize(req, getSettings().apiKey);
        blob = new Blob([bytes as BlobPart], { type: "audio/mpeg" });
      } else {
        const res = await serverCall<TtsResponse>("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const audio = await fetch(res.url);
        if (!audio.ok) throw new Error(`Could not download audio (${audio.status})`);
        blob = await audio.blob();
      }
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        throw new Error("Some audio isn't downloaded yet, and you're offline. Connect once to download it.");
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
  onProgress: (done: number, total: number) => void,
  concurrency = 4,
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
        results[i] = await getClip(reqs[i]);
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

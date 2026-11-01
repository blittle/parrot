import type { TtsRequest } from "../../shared/api";
import { cacheKey } from "../../shared/cache-key";
import { clipsDb } from "./db";
import { loadPractice } from "./practice";
import { PRESETS, type Sequence, type VoiceChoice } from "./sequence";
import { spokenTerm, spokenTranslation } from "./text";
import { getClips, resolveVoice } from "./tts";
import type { WordList } from "./types";

/**
 * Every clip a list could need for practice: each word and translation at
 * every speed used by the presets and your own sequence. Downloading these
 * makes the whole list playable offline in any sequence.
 */
export function offlineRequests(list: WordList, voices: VoiceChoice, sequences: Sequence[]): Required<TtsRequest>[] {
  const termRates = new Set<number>();
  const translationRates = new Set<number>();
  for (const seq of sequences) {
    for (const step of seq.steps) {
      if (step.type === "term") termRates.add(step.rate);
      if (step.type === "translation") translationRates.add(step.rate);
    }
  }

  const reqs = new Map<string, Required<TtsRequest>>();
  const add = (req: Required<TtsRequest>) => reqs.set(JSON.stringify(req), req);
  for (const word of list.words) {
    const term = spokenTerm(word, list.languageCode);
    if (term) {
      for (const rate of termRates) add({ text: term, languageCode: list.languageCode, voice: voices.term, speakingRate: rate });
    }
    const translation = spokenTranslation(word, list.translationLanguageCode);
    if (translation && voices.translation) {
      for (const rate of translationRates) {
        add({ text: translation, languageCode: list.translationLanguageCode, voice: voices.translation, speakingRate: rate });
      }
    }
  }
  return [...reqs.values()];
}

async function requestsFor(list: WordList): Promise<Required<TtsRequest>[]> {
  const [term, translation] = await Promise.all([
    resolveVoice(list.languageCode),
    resolveVoice(list.translationLanguageCode).catch(() => ""),
  ]);
  return offlineRequests(list, { term, translation }, [...PRESETS, loadPractice().sequence]);
}

export interface OfflineStatus {
  ready: number;
  total: number;
  /** True while paused for Google's per-minute quota. */
  waiting?: boolean;
}

export async function offlineStatus(list: WordList): Promise<OfflineStatus> {
  const reqs = await requestsFor(list);
  const present = await Promise.all(reqs.map(async (r) => clipsDb.has(await cacheKey(r))));
  return { ready: present.filter(Boolean).length, total: reqs.length };
}

/** Downloads whatever is missing. Progress counts all clips, including ones already saved. */
export async function downloadForOffline(list: WordList, onProgress: (status: OfflineStatus) => void): Promise<void> {
  const reqs = await requestsFor(list);
  const present = await Promise.all(reqs.map(async (r) => clipsDb.has(await cacheKey(r))));
  const missing = reqs.filter((_, i) => !present[i]);
  const already = reqs.length - missing.length;
  onProgress({ ready: already, total: reqs.length });
  await getClips(missing, (done, _total, waiting) => onProgress({ ready: already + done, total: reqs.length, waiting }));
}

// Downloads keep running when you leave a screen. This registry lets any
// screen (the list page, the lists overview) follow a download already in
// progress instead of showing stale numbers or starting a second one.

interface ActiveDownload {
  status: OfflineStatus;
  promise: Promise<void>;
  listeners: Set<(status: OfflineStatus | null) => void>;
}

const active = new Map<string, ActiveDownload>();

/** Starts downloading a list's audio, or returns the download already running. */
export function startDownload(list: WordList): Promise<void> {
  const running = active.get(list.id);
  if (running) return running.promise;
  const entry: ActiveDownload = { status: { ready: 0, total: 0 }, promise: Promise.resolve(), listeners: new Set() };
  entry.promise = downloadForOffline(list, (status) => {
    entry.status = status;
    entry.listeners.forEach((l) => l(status));
  }).finally(() => {
    active.delete(list.id);
    entry.listeners.forEach((l) => l(null));
  });
  active.set(list.id, entry);
  return entry.promise;
}

/** The running download for a list, if any. */
export function activeDownload(listId: string): { status: OfflineStatus; promise: Promise<void> } | undefined {
  return active.get(listId);
}

/** Follows a running download's progress; `null` means it finished or failed. Returns unsubscribe. */
export function followDownload(listId: string, listener: (status: OfflineStatus | null) => void): () => void {
  const entry = active.get(listId);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

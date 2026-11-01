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
  await getClips(missing, (done) => onProgress({ ready: already + done, total: reqs.length }));
}

import type { TtsRequest } from "../../shared/api";
import { spokenTerm, spokenTranslation } from "./text";
import type { Word, WordList } from "./types";

export type SpeakStep = {
  type: "term" | "translation";
  repeat: number;
  /** Speaking rate, 1 = normal. */
  rate: number;
  /** Silence after each repetition, in milliseconds. */
  gapMs: number;
};
export type PauseStep = { type: "pause"; ms: number };
export type Step = SpeakStep | PauseStep;

export interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: Step[];
}

export const PRESETS: Sequence[] = [
  {
    id: "listen-repeat",
    name: "Listen and repeat",
    description: "Hear the word twice, its meaning, then once more slowly. Repeat it aloud in the gaps.",
    steps: [
      { type: "term", repeat: 2, rate: 1, gapMs: 1500 },
      { type: "translation", repeat: 1, rate: 1, gapMs: 1000 },
      { type: "term", repeat: 1, rate: 0.8, gapMs: 2500 },
    ],
  },
  {
    id: "recall",
    name: "Recall",
    description: "Hear the meaning, try to say the word before it plays.",
    steps: [
      { type: "translation", repeat: 1, rate: 1, gapMs: 0 },
      { type: "pause", ms: 4000 },
      { type: "term", repeat: 2, rate: 1, gapMs: 2000 },
    ],
  },
  {
    id: "shadowing",
    name: "Shadowing",
    description: "Only the target language, three times each, for drilling pronunciation.",
    steps: [{ type: "term", repeat: 3, rate: 1, gapMs: 2000 }],
  },
  {
    id: "quick-review",
    name: "Quick review",
    description: "Word then meaning, short gaps. Good for a fast pass through a long list.",
    steps: [
      { type: "term", repeat: 1, rate: 1, gapMs: 500 },
      { type: "translation", repeat: 1, rate: 1, gapMs: 1000 },
    ],
  },
];

export interface SessionOptions {
  order: "list" | "shuffle";
  skipKnown: boolean;
  /** Zero-based index of the first word to include. */
  start: number;
  /** Number of words to include; 0 means all. */
  count: number;
  /** Extra silence between words, in milliseconds. */
  wordGapMs: number;
  /** How many times to go through the selection. */
  loops: number;
}

export const DEFAULT_OPTIONS: SessionOptions = {
  order: "list",
  skipKnown: false,
  start: 0,
  count: 0,
  wordGapMs: 1500,
  loops: 1,
};

export type PlanItem =
  | { kind: "clip"; req: Required<TtsRequest>; slot: number }
  | { kind: "silence"; ms: number; slot: number };

export interface Plan {
  items: PlanItem[];
  /** The word played in each slot, in play order (loops are flattened). */
  slots: Word[];
}

export interface VoiceChoice {
  term: string;
  translation: string;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function selectWords(words: Word[], options: SessionOptions): Word[] {
  const pool = options.skipKnown ? words.filter((w) => !w.known) : words;
  const start = Math.min(Math.max(0, options.start), pool.length);
  return options.count > 0 ? pool.slice(start, start + options.count) : pool.slice(start);
}

export function buildPlan(
  list: WordList,
  sequence: Sequence,
  options: SessionOptions,
  voices: VoiceChoice,
  random = Math.random,
): Plan {
  const selected = selectWords(list.words, options);
  const slots: Word[] = [];
  for (let loop = 0; loop < Math.max(1, options.loops); loop++) {
    slots.push(...(options.order === "shuffle" ? shuffle(selected, random) : selected));
  }

  const items: PlanItem[] = [];
  slots.forEach((word, slot) => {
    for (const step of sequence.steps) {
      if (step.type === "pause") {
        if (step.ms > 0) items.push({ kind: "silence", ms: step.ms, slot });
        continue;
      }
      const isTerm = step.type === "term";
      const languageCode = isTerm ? list.languageCode : list.translationLanguageCode;
      const text = isTerm ? spokenTerm(word, languageCode) : spokenTranslation(word, languageCode);
      if (!text) continue; // e.g. a word with no translation
      for (let r = 0; r < Math.max(1, step.repeat); r++) {
        items.push({
          kind: "clip",
          slot,
          req: {
            text,
            languageCode,
            voice: isTerm ? voices.term : voices.translation,
            speakingRate: step.rate,
          },
        });
        if (step.gapMs > 0) items.push({ kind: "silence", ms: step.gapMs, slot });
      }
    }
    if (options.wordGapMs > 0) items.push({ kind: "silence", ms: options.wordGapMs, slot });
  });

  return { items, slots };
}

/** Unique clip requests in a plan, for prefetching. */
export function uniqueClips(plan: Plan): Required<TtsRequest>[] {
  const seen = new Map<string, Required<TtsRequest>>();
  for (const item of plan.items) {
    if (item.kind !== "clip") continue;
    const key = JSON.stringify(item.req);
    if (!seen.has(key)) seen.set(key, item.req);
  }
  return [...seen.values()];
}

/** A plan with only the given slots kept, renumbered in order. */
export function keepSlots(plan: Plan, keep: (slot: number) => boolean): Plan {
  const renumber = new Map<number, number>();
  const slots: Word[] = [];
  plan.slots.forEach((word, i) => {
    if (keep(i)) {
      renumber.set(i, slots.length);
      slots.push(word);
    }
  });
  const items = plan.items.filter((item) => renumber.has(item.slot)).map((item) => ({ ...item, slot: renumber.get(item.slot)! }));
  return { items, slots };
}

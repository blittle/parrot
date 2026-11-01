import { DEFAULT_OPTIONS, PRESETS, type Sequence, type SessionOptions } from "./sequence";

// The Practice page's last-used sequence and options, kept between visits.

const PRACTICE_KEY = "parrot:practice";

export interface PracticeSettings {
  sequence: Sequence;
  options: SessionOptions;
}

export function loadPractice(): PracticeSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? "null") as PracticeSettings | null;
    if (saved?.sequence?.steps && saved.options) return { sequence: saved.sequence, options: { ...DEFAULT_OPTIONS, ...saved.options } };
  } catch {
    // Fall through to defaults.
  }
  return { sequence: structuredClone(PRESETS[0]), options: DEFAULT_OPTIONS };
}

export function savePractice(settings: PracticeSettings): void {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(settings));
  } catch {
    // Not critical.
  }
}

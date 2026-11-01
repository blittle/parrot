import { describe, expect, it } from "vitest";
import { offlineRequests } from "./offline";
import { PRESETS, type Sequence } from "./sequence";
import type { WordList } from "./types";

const list: WordList = {
  id: "l",
  name: "Test",
  languageCode: "de-DE",
  translationLanguageCode: "en-US",
  createdAt: 0,
  updatedAt: 0,
  words: [
    { id: "a", term: "Hund", article: "der", translation: "dog" },
    { id: "b", term: "Katze", article: "die", translation: "" },
  ],
};
const voices = { term: "de-DE-Chirp3-HD-Aoede", translation: "en-US-Chirp3-HD-Puck" };

describe("offlineRequests", () => {
  it("covers every speed used by the presets", () => {
    const reqs = offlineRequests(list, voices, PRESETS);
    const keys = reqs.map((r) => `${r.text}@${r.speakingRate}`).sort();
    // Presets speak terms at 1 and 0.8, translations at 1. "die Katze" has no translation.
    expect(keys).toEqual(["der Hund@0.8", "der Hund@1", "die Katze@0.8", "die Katze@1", "dog@1"]);
  });

  it("adds speeds from a custom sequence", () => {
    const custom: Sequence = { id: "custom", name: "c", description: "", steps: [{ type: "term", repeat: 1, rate: 0.6, gapMs: 0 }] };
    const rates = new Set(offlineRequests(list, voices, [...PRESETS, custom]).map((r) => r.speakingRate));
    expect(rates).toEqual(new Set([1, 0.8, 0.6]));
  });

  it("skips translations when no translation voice is known", () => {
    const reqs = offlineRequests(list, { term: voices.term, translation: "" }, PRESETS);
    expect(reqs.every((r) => r.languageCode === "de-DE")).toBe(true);
  });
});

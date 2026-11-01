import { describe, expect, it } from "vitest";
import { buildPlan, DEFAULT_OPTIONS, PRESETS, selectWords, shuffle, uniqueClips, type Sequence } from "./sequence";
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
    { id: "b", term: "Katze", article: "die", translation: "cat", known: true },
    { id: "c", term: "Haus", article: "das", translation: "" },
  ],
};
const voices = { term: "de-DE-Chirp3-HD-Aoede", translation: "en-US-Chirp3-HD-Puck" };

describe("selectWords", () => {
  it("applies range and known filter", () => {
    expect(selectWords(list.words, { ...DEFAULT_OPTIONS, skipKnown: true }).map((w) => w.id)).toEqual(["a", "c"]);
    expect(selectWords(list.words, { ...DEFAULT_OPTIONS, start: 1, count: 1 }).map((w) => w.id)).toEqual(["b"]);
    expect(selectWords(list.words, { ...DEFAULT_OPTIONS, start: 10 })).toEqual([]);
  });
});

describe("buildPlan", () => {
  const seq: Sequence = {
    id: "t",
    name: "t",
    description: "",
    steps: [
      { type: "term", repeat: 2, rate: 1, gapMs: 1000 },
      { type: "pause", ms: 500 },
      { type: "translation", repeat: 1, rate: 1, gapMs: 0 },
      { type: "term", repeat: 1, rate: 0.8, gapMs: 2000 },
    ],
  };

  it("expands steps into clips and silences", () => {
    const plan = buildPlan({ ...list, words: [list.words[0]] }, seq, { ...DEFAULT_OPTIONS, wordGapMs: 1500 }, voices);
    expect(plan.items.map((i) => (i.kind === "clip" ? `${i.req.text}@${i.req.speakingRate}` : i.ms))).toEqual([
      "der Hund@1",
      1000,
      "der Hund@1",
      1000,
      500,
      "dog@1",
      "der Hund@0.8",
      2000,
      1500,
    ]);
    const dog = plan.items.find((i) => i.kind === "clip" && i.req.text === "dog");
    expect(dog?.kind === "clip" && dog.req.voice).toBe(voices.translation);
    expect(dog?.kind === "clip" && dog.req.languageCode).toBe("en-US");
  });

  it("skips empty translations and loops", () => {
    const plan = buildPlan({ ...list, words: [list.words[2]] }, seq, { ...DEFAULT_OPTIONS, loops: 2 }, voices);
    expect(plan.slots.map((w) => w.id)).toEqual(["c", "c"]);
    expect(plan.items.filter((i) => i.kind === "clip" && i.req.languageCode === "en-US")).toHaveLength(0);
    expect(new Set(plan.items.map((i) => i.slot))).toEqual(new Set([0, 1]));
  });

  it("dedupes clips for prefetching", () => {
    const plan = buildPlan(list, PRESETS[0], { ...DEFAULT_OPTIONS, loops: 3 }, voices);
    // 3 words: term@1 and term@0.8 each, plus 2 non-empty translations.
    expect(uniqueClips(plan)).toHaveLength(8);
  });
});

describe("shuffle", () => {
  it("keeps all items", () => {
    expect(shuffle([1, 2, 3, 4], () => 0.3).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("keepSlots", () => {
  it("drops slots and renumbers the rest", async () => {
    const { keepSlots } = await import("./sequence");
    const plan = buildPlan(list, PRESETS[3], { ...DEFAULT_OPTIONS, loops: 2 }, voices);
    // Quick review: term + translation per word; 3 words x 2 loops = 6 slots.
    expect(plan.slots).toHaveLength(6);
    const kept = keepSlots(plan, (slot) => plan.slots[slot].id !== "b");
    expect(kept.slots.map((w) => w.id)).toEqual(["a", "c", "a", "c"]);
    expect(new Set(kept.items.map((i) => i.slot))).toEqual(new Set([0, 1, 2, 3]));
    expect(kept.items.some((i) => i.kind === "clip" && i.req.text === "die Katze")).toBe(false);
    // Items stay in order within each slot.
    const slots = kept.items.map((i) => i.slot);
    expect([...slots].sort((x, y) => x - y)).toEqual(slots);
  });
});

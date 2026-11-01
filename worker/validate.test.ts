import { describe, expect, it } from "vitest";
import { normalizeText, validateTtsRequest } from "./validate";
import { cacheKey } from "./cache-key";
import { voiceFamily } from "./google";

const base = { text: "der Hund", languageCode: "de-DE", voice: "de-DE-Chirp3-HD-Aoede" };

describe("validateTtsRequest", () => {
  it("accepts a valid request and defaults the rate", () => {
    const r = validateTtsRequest(base);
    expect(r).toEqual({ ok: true, value: { ...base, speakingRate: 1 } });
  });

  it("rejects bad input", () => {
    expect(validateTtsRequest(null).ok).toBe(false);
    expect(validateTtsRequest({ ...base, text: "   " }).ok).toBe(false);
    expect(validateTtsRequest({ ...base, text: "a".repeat(501) }).ok).toBe(false);
    expect(validateTtsRequest({ ...base, languageCode: "german" }).ok).toBe(false);
    expect(validateTtsRequest({ ...base, voice: "../etc" }).ok).toBe(false);
    expect(validateTtsRequest({ ...base, speakingRate: 3 }).ok).toBe(false);
    expect(validateTtsRequest({ ...base, speakingRate: "1" }).ok).toBe(false);
  });

  it("rounds the speaking rate", () => {
    const r = validateTtsRequest({ ...base, speakingRate: 0.9000001 });
    expect(r.ok && r.value.speakingRate).toBe(0.9);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and composes umlauts", () => {
    expect(normalizeText("  die   Mütze ")).toBe("die Mütze");
  });
});

describe("cacheKey", () => {
  it("is stable for equivalent input and differs otherwise", async () => {
    const a = validateTtsRequest({ ...base, text: " der  Hund " });
    const b = validateTtsRequest(base);
    const c = validateTtsRequest({ ...base, speakingRate: 0.8 });
    if (!a.ok || !b.ok || !c.ok) throw new Error("invalid");
    const [ka, kb, kc] = await Promise.all([cacheKey(a.value), cacheKey(b.value), cacheKey(c.value)]);
    expect(ka).toMatch(/^[a-f0-9]{64}$/);
    expect(ka).toBe(kb);
    expect(ka).not.toBe(kc);
  });
});

describe("voiceFamily", () => {
  it("extracts the family from voice names", () => {
    expect(voiceFamily("de-DE-Chirp3-HD-Aoede", "de-DE")).toBe("Chirp3-HD");
    expect(voiceFamily("de-DE-Neural2-B", "de-DE")).toBe("Neural2");
    expect(voiceFamily("de-DE-Wavenet-F", "de-DE")).toBe("Wavenet");
  });
});

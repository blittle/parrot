import type { TtsRequest } from "../shared/api";

export const MAX_TEXT_LENGTH = 500;
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;

const LANGUAGE_CODE = /^[a-z]{2,3}-[A-Z]{2}$/;
const VOICE_NAME = /^[A-Za-z0-9-]{1,80}$/;

export type Validated =
  | { ok: true; value: Required<TtsRequest> }
  | { ok: false; error: string };

/** Normalizes text so equivalent inputs share one cache entry. */
export function normalizeText(text: string): string {
  // NFC so "ü" typed as u + combining diaeresis matches the precomposed form.
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function validateTtsRequest(body: unknown): Validated {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const { text, languageCode, voice, speakingRate } = body as Record<string, unknown>;

  if (typeof text !== "string") return { ok: false, error: "text must be a string" };
  const normalized = normalizeText(text);
  if (normalized.length === 0) return { ok: false, error: "text is empty" };
  if (normalized.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `text is longer than ${MAX_TEXT_LENGTH} characters` };
  }

  if (typeof languageCode !== "string" || !LANGUAGE_CODE.test(languageCode)) {
    return { ok: false, error: "languageCode must look like de-DE" };
  }
  if (typeof voice !== "string" || !VOICE_NAME.test(voice)) {
    return { ok: false, error: "voice is not a valid voice name" };
  }

  let rate = 1;
  if (speakingRate !== undefined) {
    if (typeof speakingRate !== "number" || !Number.isFinite(speakingRate)) {
      return { ok: false, error: "speakingRate must be a number" };
    }
    if (speakingRate < MIN_RATE || speakingRate > MAX_RATE) {
      return { ok: false, error: `speakingRate must be between ${MIN_RATE} and ${MAX_RATE}` };
    }
    // Round so 0.9 and 0.90000001 share a cache entry.
    rate = Math.round(speakingRate * 100) / 100;
  }

  return { ok: true, value: { text: normalized, languageCode, voice, speakingRate: rate } };
}

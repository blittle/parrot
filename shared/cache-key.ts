import type { TtsRequest } from "./api";

// Bump when the synthesis output would change for the same inputs
// (e.g. switching audio encoding), so old cache entries are not reused.
const CACHE_VERSION = 1;

/** SHA-256 hex digest identifying one synthesized clip. Input must already be validated. */
export async function cacheKey(req: Required<TtsRequest>): Promise<string> {
  // Fixed key order so the digest is stable.
  const canonical = JSON.stringify([
    CACHE_VERSION,
    "google",
    req.languageCode,
    req.voice,
    req.speakingRate,
    req.text,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function audioObjectKey(hash: string): string {
  return `tts/${hash}.mp3`;
}

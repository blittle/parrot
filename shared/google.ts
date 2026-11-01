import type { TtsRequest, Voice } from "./api";

const BASE = "https://texttospeech.googleapis.com/v1";

export class GoogleTtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function googleFetch(path: string, apiKey: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // Header instead of ?key= so the key never shows up in URL logs.
      "X-Goog-Api-Key": apiKey,
    },
  });
  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new GoogleTtsError(body?.error?.message ?? `Google TTS returned ${res.status}`, res.status);
  }
  return body;
}

/** Synthesizes MP3 audio. Returns the raw bytes. */
export async function synthesize(req: Required<TtsRequest>, apiKey: string): Promise<Uint8Array> {
  const body = (await googleFetch("/text:synthesize", apiKey, {
    method: "POST",
    body: JSON.stringify({
      input: { text: req.text },
      voice: { languageCode: req.languageCode, name: req.voice },
      audioConfig: { audioEncoding: "MP3", speakingRate: req.speakingRate },
    }),
  })) as { audioContent?: string };

  if (!body.audioContent) throw new GoogleTtsError("Google TTS returned no audio", 502);
  return Uint8Array.from(atob(body.audioContent), (c) => c.charCodeAt(0));
}

/** Derives the voice family from a name like "de-DE-Chirp3-HD-Aoede" or "de-DE-Neural2-B". */
export function voiceFamily(name: string, languageCode: string): string {
  const rest = name.startsWith(`${languageCode}-`) ? name.slice(languageCode.length + 1) : name;
  const parts = rest.split("-");
  // Drop the final segment (the speaker id), keep the rest as the family.
  return parts.length > 1 ? parts.slice(0, -1).join("-") : rest;
}

export async function listVoices(languageCode: string, apiKey: string): Promise<Voice[]> {
  const body = (await googleFetch(
    `/voices?languageCode=${encodeURIComponent(languageCode)}`,
    apiKey,
  )) as { voices?: { name: string; languageCodes: string[]; ssmlGender: string }[] };

  return (body.voices ?? [])
    // The filter is a prefix match, so drop voices for other locales (e.g. de-AT for "de").
    .filter((v) => v.languageCodes.includes(languageCode))
    .map((v) => ({
      name: v.name,
      languageCode,
      gender: v.ssmlGender,
      family: voiceFamily(v.name, languageCode),
    }))
    .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
}

import type { ApiError, TtsRequest, TtsResponse, Voice, VoicesResponse } from "../shared/api";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    throw new Error((body as ApiError | null)?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export async function fetchVoices(lang: string): Promise<Voice[]> {
  const { voices } = await call<VoicesResponse>(`/api/voices?lang=${encodeURIComponent(lang)}`);
  return voices;
}

export function synthesize(req: TtsRequest): Promise<TtsResponse> {
  return call<TtsResponse>("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

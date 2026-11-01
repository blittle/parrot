// Types shared between the Worker API and the React app.

export interface TtsRequest {
  text: string;
  /** BCP-47 language code, e.g. "de-DE". */
  languageCode: string;
  /** Google voice name, e.g. "de-DE-Chirp3-HD-Aoede". */
  voice: string;
  /** 0.25 to 2.0, where 1.0 is normal speed. */
  speakingRate?: number;
}

export interface TtsResponse {
  /** Content hash of the synthesis parameters; also the audio's R2 key. */
  hash: string;
  /** Path the audio can be fetched from. */
  url: string;
  /** True when the audio came from the R2 cache instead of a fresh synthesis. */
  cached: boolean;
}

export interface Voice {
  name: string;
  languageCode: string;
  gender: string;
  /** Voice family derived from the name, e.g. "Chirp3-HD", "Neural2", "Wavenet". */
  family: string;
}

export interface VoicesResponse {
  voices: Voice[];
}

export interface ApiError {
  error: string;
}

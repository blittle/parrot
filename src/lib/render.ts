import { cacheKey } from "../../shared/cache-key";
import type { Plan } from "./sequence";
import { getClips } from "./tts";
import { WAV_HEADER_BYTES, wavHeader, writeSamples } from "./wav";

// Google's MP3 output is 24 kHz mono, so render at that rate to avoid resampling.
export const SAMPLE_RATE = 24000;

export interface Segment {
  slot: number;
  start: number;
  end: number;
}

export interface RenderedSession {
  wav: Blob;
  duration: number;
  /** Time range of each word slot, for showing the current word and skipping. */
  segments: Segment[];
}

export type RenderProgress =
  | { phase: "audio"; done: number; total: number }
  | { phase: "render" };

/**
 * Renders a whole session (clips plus silences) into one WAV file. A single
 * file keeps playing with the phone locked, where chaining clips with timers
 * would stall, and can be downloaded as-is.
 */
export async function renderSession(plan: Plan, onProgress: (p: RenderProgress) => void): Promise<RenderedSession> {
  const clipItems = plan.items.filter((i) => i.kind === "clip");
  const reqs = clipItems.map((i) => i.req);
  const clips = await getClips(reqs, (done, total) => onProgress({ phase: "audio", done, total }));
  onProgress({ phase: "render" });

  // Decode each unique clip once.
  const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const decoded = new Map<string, Float32Array>();
  for (const clip of clips) {
    if (decoded.has(clip.hash)) continue;
    const buffer = await decoder.decodeAudioData(await clip.blob.arrayBuffer());
    decoded.set(clip.hash, mixToMono(buffer));
  }

  const hashes = await Promise.all(reqs.map((r) => cacheKey(r)));
  let clipIndex = 0;
  const layout: { slot: number; samples: Float32Array | null; length: number }[] = plan.items.map((item) => {
    if (item.kind === "silence") {
      return { slot: item.slot, samples: null, length: Math.round((item.ms / 1000) * SAMPLE_RATE) };
    }
    const samples = decoded.get(hashes[clipIndex++])!;
    return { slot: item.slot, samples, length: samples.length };
  });

  const total = layout.reduce((sum, l) => sum + l.length, 0);
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + total * 2));
  wavHeader(view, total, SAMPLE_RATE);

  const segments: Segment[] = [];
  let offset = 0;
  for (const part of layout) {
    if (part.samples) writeSamples(view, part.samples, offset);
    const last = segments[segments.length - 1];
    const start = offset / SAMPLE_RATE;
    offset += part.length;
    const end = offset / SAMPLE_RATE;
    if (last && last.slot === part.slot) last.end = end;
    else segments.push({ slot: part.slot, start, end });
  }

  return { wav: new Blob([view.buffer], { type: "audio/wav" }), duration: total / SAMPLE_RATE, segments };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Rough duration estimate in seconds, before the real clip lengths are known. */
export function estimateSeconds(plan: Plan, secondsPerClip = 1.5): number {
  return plan.items.reduce((sum, i) => sum + (i.kind === "silence" ? i.ms / 1000 : secondsPerClip), 0);
}

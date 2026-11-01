/** Writes a 16-bit PCM mono WAV header. `sampleCount` is the number of samples that follow. */
export function wavHeader(view: DataView, sampleCount: number, sampleRate: number): void {
  const dataBytes = sampleCount * 2;
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
}

export const WAV_HEADER_BYTES = 44;

/** Writes float samples (-1..1) as 16-bit PCM starting at the given sample offset. */
export function writeSamples(view: DataView, samples: Float32Array, sampleOffset: number): void {
  let byte = WAV_HEADER_BYTES + sampleOffset * 2;
  for (let i = 0; i < samples.length; i++, byte += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(byte, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

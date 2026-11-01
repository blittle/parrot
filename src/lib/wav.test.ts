import { describe, expect, it } from "vitest";
import { WAV_HEADER_BYTES, wavHeader, writeSamples } from "./wav";

describe("wav", () => {
  it("writes a valid mono 16-bit header and samples", () => {
    const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + 4 * 2));
    wavHeader(view, 4, 24000);
    writeSamples(view, new Float32Array([0, 1, -1, 2]), 0);
    const ascii = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});

import { describe, expect, it } from "vitest";
import { buildWords, decodeText, guessMapping, looksLikeHeader, NO_COLUMN, parseDelimited } from "./import";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("decodeText", () => {
  it("decodes UTF-8 with and without BOM", () => {
    expect(decodeText(enc("Bröt"))).toBe("Bröt");
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Bröt")]).buffer)).toBe("Bröt");
  });

  it("falls back to Windows-1252 for legacy Excel CSVs", () => {
    // "Brötchen; Straße" in Windows-1252: ö = 0xF6, ß = 0xDF
    const bytes = new Uint8Array([0x42, 0x72, 0xf6, 0x74, 0x3b, 0x20, 0x53, 0x74, 0x72, 0x61, 0xdf, 0x65]);
    expect(decodeText(bytes.buffer)).toBe("Bröt; Straße");
  });

  it("decodes UTF-16 LE with BOM", () => {
    const s = "Tür";
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < s.length; i++) bytes[2 + i * 2] = s.charCodeAt(i);
    expect(decodeText(bytes.buffer)).toBe("Tür");
  });
});

describe("parseDelimited", () => {
  it("detects tabs, semicolons and commas", () => {
    expect(parseDelimited("Hund\tdog\nKatze\tcat")).toEqual([["Hund", "dog"], ["Katze", "cat"]]);
    expect(parseDelimited("Hund;dog\nKatze;cat")).toEqual([["Hund", "dog"], ["Katze", "cat"]]);
    expect(parseDelimited('Hund,dog\n"Brötchen, das",roll')).toEqual([["Hund", "dog"], ["Brötchen, das", "roll"]]);
  });

  it("drops blank lines and pads short rows", () => {
    expect(parseDelimited("a,b,c\n\nd")).toEqual([["a", "b", "c"], ["d", "", ""]]);
  });
});

describe("guessMapping", () => {
  it("uses header names", () => {
    const rows = [["English", "Artikel", "Deutsch"], ["dog", "der", "Hund"]];
    expect(looksLikeHeader(rows[0])).toBe(true);
    expect(guessMapping(rows, true, "de-DE")).toEqual({ term: 2, translation: 0, article: 1, notes: NO_COLUMN });
  });

  it("detects an article column from the data", () => {
    const rows = [["der", "Hund", "dog"], ["die", "Katze", "cat"], ["das", "Haus", "house"]];
    expect(looksLikeHeader(rows[0])).toBe(false);
    expect(guessMapping(rows, false, "de-DE")).toEqual({ term: 1, translation: 2, article: 0, notes: NO_COLUMN });
  });

  it("falls back to column order", () => {
    const rows = [["Hund", "dog", "a pet"]];
    expect(guessMapping(rows, false, "de-DE")).toEqual({ term: 0, translation: 1, article: NO_COLUMN, notes: 2 });
  });
});

describe("buildWords", () => {
  it("builds words and skips rows without a term", () => {
    const rows = [["Wort", "Englisch"], ["Hund", "dog"], ["", "orphan"], ["Katze", ""]];
    let n = 0;
    const words = buildWords(rows, { term: 0, translation: 1, article: NO_COLUMN, notes: NO_COLUMN }, true, () => String(++n));
    expect(words).toEqual([
      { id: "1", term: "Hund", translation: "dog" },
      { id: "2", term: "Katze", translation: "" },
    ]);
  });
});

import Papa from "papaparse";
import type { Word } from "./types";
import { ARTICLES, baseLanguage } from "./text";

export type Rows = string[][];

export interface ColumnMapping {
  term: number;
  translation: number;
  article: number;
  notes: number;
}

export const NO_COLUMN = -1;

/**
 * Decodes a text file, handling the encodings spreadsheet apps actually produce:
 * UTF-8 (with or without BOM), UTF-16 ("Unicode text" from Excel), and
 * Windows-1252 (legacy "CSV" from Excel), so umlauts survive.
 */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasUtf8Bom ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

/** Parses CSV/TSV/semicolon-separated text, guessing the delimiter. */
export function parseDelimited(text: string): Rows {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: "greedy",
    delimitersToGuess: ["\t", ";", ",", "|"],
  });
  return tidyRows(result.data);
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Trims cells, drops empty rows, and pads rows to equal width. */
export function tidyRows(raw: unknown[][]): Rows {
  const rows = raw
    .map((row) => row.map(cellToString))
    .filter((row) => row.some((cell) => cell !== ""));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
}

export async function readFile(file: File): Promise<Rows> {
  const isExcel =
    /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (isExcel) {
    // Loaded on demand so the main bundle stays small.
    const { readSheet } = await import("read-excel-file/browser");
    return tidyRows((await readSheet(file)) as unknown[][]);
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error("Old .xls files aren't supported. Save the sheet as .xlsx or CSV and try again.");
  }
  return parseDelimited(decodeText(await file.arrayBuffer()));
}

const HEADER_PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  term: /^(word|words|term|vocab\w*|wort|wörter|german|deutsch|french|français|francais|spanish|español|espanol|italian|italiano|front|target)$/i,
  translation: /^(english|englisch|translation|translations|meaning|definition|übersetzung|bedeutung|back|native)$/i,
  article: /^(article|artikel|gender|genus|geschlecht|der\/die\/das)$/i,
  notes: /^(notes?|notiz(en)?|comments?|plural|example|beispiel|hint)$/i,
};

/** True when the first row looks like column names rather than vocabulary. */
export function looksLikeHeader(row: string[]): boolean {
  return row.some((cell) =>
    Object.values(HEADER_PATTERNS).some((pattern) => pattern.test(cell.trim())),
  );
}

function isArticleColumn(rows: Rows, col: number, languageCode: string): boolean {
  const articles = ARTICLES[baseLanguage(languageCode)] ?? [];
  const markers = new Set([...articles, "m", "f", "n", "m.", "f.", "n."]);
  const values = rows.map((r) => r[col]?.toLowerCase().trim()).filter(Boolean);
  if (values.length === 0) return false;
  const hits = values.filter((v) => markers.has(v)).length;
  return hits / values.length >= 0.6;
}

/** Guesses which column is which, from header names first, then from the data. */
export function guessMapping(rows: Rows, hasHeader: boolean, languageCode: string): ColumnMapping {
  const mapping: ColumnMapping = { term: NO_COLUMN, translation: NO_COLUMN, article: NO_COLUMN, notes: NO_COLUMN };
  const width = rows[0]?.length ?? 0;
  const taken = new Set<number>();

  if (hasHeader && rows[0]) {
    for (const key of Object.keys(HEADER_PATTERNS) as (keyof ColumnMapping)[]) {
      const index = rows[0].findIndex((cell, i) => !taken.has(i) && HEADER_PATTERNS[key].test(cell.trim()));
      if (index !== NO_COLUMN) {
        mapping[key] = index;
        taken.add(index);
      }
    }
  }

  const data = hasHeader ? rows.slice(1) : rows;
  if (mapping.article === NO_COLUMN) {
    for (let i = 0; i < width; i++) {
      if (!taken.has(i) && isArticleColumn(data, i, languageCode)) {
        mapping.article = i;
        taken.add(i);
        break;
      }
    }
  }

  // Remaining columns in order: term, then translation, then notes.
  const free = [...Array(width).keys()].filter((i) => !taken.has(i));
  for (const key of ["term", "translation", "notes"] as const) {
    if (mapping[key] === NO_COLUMN && free.length > 0) mapping[key] = free.shift()!;
  }
  return mapping;
}

export function buildWords(
  rows: Rows,
  mapping: ColumnMapping,
  hasHeader: boolean,
  makeId: () => string = () => crypto.randomUUID(),
): Word[] {
  const data = hasHeader ? rows.slice(1) : rows;
  const cell = (row: string[], col: number) => (col === NO_COLUMN ? "" : (row[col] ?? "").trim());
  const words: Word[] = [];
  for (const row of data) {
    const term = cell(row, mapping.term);
    if (!term) continue;
    const word: Word = { id: makeId(), term, translation: cell(row, mapping.translation) };
    const article = cell(row, mapping.article);
    const notes = cell(row, mapping.notes);
    if (article) word.article = article;
    if (notes) word.notes = notes;
    words.push(word);
  }
  return words;
}

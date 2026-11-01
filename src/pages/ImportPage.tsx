import { useMemo, useState } from "react";
import { requestAutoDownload } from "../components/OfflinePanel";
import { Term } from "../components/Term";
import { listsDb } from "../lib/db";
import { buildWords, guessMapping, looksLikeHeader, NO_COLUMN, parseDelimited, readFile, type ColumnMapping, type Rows } from "../lib/import";
import { TARGET_LANGUAGES, TRANSLATION_LANGUAGES } from "../lib/languages";
import { navigate } from "../lib/router";
import { spokenTerm } from "../lib/text";

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "term", label: "Word", required: true },
  { key: "translation", label: "Translation" },
  { key: "article", label: "Article / gender" },
  { key: "notes", label: "Notes" },
];

const SAMPLE = `Artikel\tWort\tEnglisch
der\tHund\tdog
die\tKatze\tcat
das\tEichhörnchen (n.)\tsquirrel
\tEntschuldigung\texcuse me
die\tStraße, -n\tstreet`;

export function ImportPage() {
  const [rows, setRows] = useState<Rows | null>(null);
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [languageCode, setLanguageCode] = useState("de-DE");
  const [translationLanguageCode, setTranslationLanguageCode] = useState("en-US");
  const [hasHeader, setHasHeader] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load(next: Rows, fileName: string) {
    if (next.length === 0) {
      setError("No rows found.");
      return;
    }
    const header = looksLikeHeader(next[0]);
    setError(null);
    setRows(next);
    setHasHeader(header);
    setMapping(guessMapping(next, header, languageCode));
    if (!name) setName(fileName.replace(/\.[^.]+$/, ""));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      load(await readFile(file), file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onPaste() {
    load(parseDelimited(paste), "Pasted list");
  }

  function setHeader(value: boolean) {
    setHasHeader(value);
    if (rows) setMapping(guessMapping(rows, value, languageCode));
  }

  const words = useMemo(
    () => (rows && mapping && mapping.term !== NO_COLUMN ? buildWords(rows, mapping, hasHeader, () => "") : []),
    [rows, mapping, hasHeader],
  );

  async function save() {
    if (!rows || !mapping) return;
    setSaving(true);
    try {
      const now = Date.now();
      const id = crypto.randomUUID();
      await listsDb.put({
        id,
        name: name.trim() || "Untitled list",
        languageCode,
        translationLanguageCode,
        words: buildWords(rows, mapping, hasHeader),
        createdAt: now,
        updatedAt: now,
      });
      requestAutoDownload(id);
      navigate("lists", id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const width = rows?.[0]?.length ?? 0;
  const columnLabel = (i: number) => {
    const header = hasHeader ? rows?.[0][i] : "";
    return header || `Column ${i + 1}`;
  };

  return (
    <>
      <h1>Import a list</h1>

      <section className="panel">
        <div className="grid-2">
          <label className="field">
            <span>Language you're learning</span>
            <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Translations are in</span>
            <select value={translationLanguageCode} onChange={(e) => setTranslationLanguageCode(e.target.value)}>
              {TRANSLATION_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="file-drop">
          <input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(e) => void onFile(e.target.files?.[0])} />
          <strong>Choose a spreadsheet</strong>
          <span className="muted small">.xlsx, .csv or .tsv from Files, Drive or iCloud</span>
        </label>

        <details>
          <summary>Or paste words</summary>
          <p className="muted small">One word per line, with columns separated by tabs (copied from a spreadsheet), commas or semicolons.</p>
          <textarea rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={SAMPLE} lang="de" />
          <div className="row-actions">
            <button className="button" onClick={onPaste} disabled={!paste.trim()}>
              Use pasted text
            </button>
            <button className="button" onClick={() => setPaste(SAMPLE)}>
              Fill in an example
            </button>
          </div>
        </details>
      </section>

      {error && <p className="error">{error}</p>}

      {rows && mapping && (
        <section className="panel">
          <h2>Columns</h2>
          <label className="toggle">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHeader(e.target.checked)} />
            First row is column names
          </label>
          <div className="grid-4">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <select value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  {!f.required && <option value={NO_COLUMN}>(none)</option>}
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>
                      {columnLabel(i)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <h2>
            Preview <span className="muted">({words.length} words)</span>
          </h2>
          <div className="table-wrap">
            <table className="words preview">
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Spoken as</th>
                  <th>Translation</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {words.slice(0, 10).map((w, i) => (
                  <tr key={i}>
                    <td>
                      <Term word={w} languageCode={languageCode} />
                    </td>
                    <td lang={languageCode} className="muted">
                      {spokenTerm(w, languageCode)}
                    </td>
                    <td>{w.translation}</td>
                    <td className="muted">{w.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {words.length > 10 && <p className="muted small">…and {words.length - 10} more.</p>}

          <div className="grid-2 end">
            <label className="field">
              <span>List name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="button primary" onClick={() => void save()} disabled={saving || words.length === 0}>
              Save {words.length} words and download audio
            </button>
          </div>
        </section>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { listsDb } from "../lib/db";
import { languageLabel } from "../lib/languages";
import { href, navigate } from "../lib/router";
import { spokenTerm } from "../lib/text";
import { getClip, resolveVoice } from "../lib/tts";
import type { Word, WordList } from "../lib/types";

export function ListPage({ id }: { id: string }) {
  const [list, setList] = useState<WordList | null | undefined>(undefined);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    listsDb.get(id).then((l) => setList(l ?? null), (e: Error) => setError(e.message));
  }, [id]);

  if (list === undefined) return <p className="muted">Loading…</p>;
  if (list === null) return <p>List not found. <a href={href("lists")}>Back to lists</a></p>;

  async function save(next: WordList) {
    setList(next);
    await listsDb.put(next);
  }

  function updateWord(wordId: string, patch: Partial<Word>) {
    if (!list) return;
    void save({ ...list, words: list.words.map((w) => (w.id === wordId ? { ...w, ...patch } : w)) });
  }

  function removeWord(wordId: string) {
    if (!list) return;
    void save({ ...list, words: list.words.filter((w) => w.id !== wordId) });
  }

  function addWord() {
    if (!list) return;
    void save({ ...list, words: [...list.words, { id: crypto.randomUUID(), term: "", translation: "" }] });
  }

  async function deleteList() {
    if (!list || !confirm(`Delete "${list.name}"? This can't be undone.`)) return;
    await listsDb.delete(list.id);
    navigate("lists");
  }

  async function play(word: Word) {
    if (!list) return;
    setError(null);
    audio.current?.pause();
    setPlaying(word.id);
    try {
      const voice = await resolveVoice(list.languageCode);
      const clip = await getClip({ text: spokenTerm(word, list.languageCode), languageCode: list.languageCode, voice, speakingRate: 1 });
      const url = URL.createObjectURL(clip.blob);
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(null);
      };
      await el.play();
    } catch (e) {
      setError((e as Error).message);
      setPlaying(null);
    }
  }

  const known = list.words.filter((w) => w.known).length;

  return (
    <>
      <div className="page-head">
        <div>
          <input
            className="title-input"
            value={list.name}
            onChange={(e) => setList({ ...list, name: e.target.value })}
            onBlur={() => void save(list)}
            aria-label="List name"
          />
          <p className="muted small">
            {languageLabel(list.languageCode)} → {languageLabel(list.translationLanguageCode)} · {list.words.length} words · {known} known
          </p>
        </div>
        <a className="button primary" href={href("practice", list.id)}>
          Practice
        </a>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table className="words">
          <thead>
            <tr>
              <th aria-label="Play" />
              <th>Article</th>
              <th>Word</th>
              <th>Translation</th>
              <th>Spoken as</th>
              <th>Notes</th>
              <th title="Known words can be skipped in practice">Known</th>
              <th aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {list.words.map((w) => (
              <WordRow
                key={w.id}
                word={w}
                languageCode={list.languageCode}
                playing={playing === w.id}
                onPlay={() => void play(w)}
                onChange={(patch) => updateWord(w.id, patch)}
                onRemove={() => removeWord(w.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-actions">
        <button className="button" onClick={addWord}>
          Add word
        </button>
        <button className="button danger" onClick={() => void deleteList()}>
          Delete list
        </button>
      </div>
    </>
  );
}

function WordRow({
  word,
  languageCode,
  playing,
  onPlay,
  onChange,
  onRemove,
}: {
  word: Word;
  languageCode: string;
  playing: boolean;
  onPlay: () => void;
  onChange: (patch: Partial<Word>) => void;
  onRemove: () => void;
}) {
  // Edit locally, save on blur, so typing doesn't write to IndexedDB on every keystroke.
  const [draft, setDraft] = useState(word);
  useEffect(() => setDraft(word), [word]);
  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(word)) onChange(draft);
  };
  const field = (key: "article" | "term" | "translation" | "spoken" | "notes", props: { placeholder?: string; lang?: string } = {}) => (
    <input
      value={draft[key] ?? ""}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onBlur={commit}
      aria-label={key}
      {...props}
    />
  );

  return (
    <tr className={word.known ? "known" : ""}>
      <td>
        <button className="play small" onClick={onPlay} disabled={!word.term.trim()} aria-label={`Play ${word.term}`}>
          {playing ? "…" : "▶"}
        </button>
      </td>
      <td className="narrow">{field("article", { lang: languageCode })}</td>
      <td>{field("term", { lang: languageCode })}</td>
      <td>{field("translation")}</td>
      <td>{field("spoken", { placeholder: spokenTerm({ ...draft, spoken: undefined }, languageCode), lang: languageCode })}</td>
      <td>{field("notes")}</td>
      <td className="center">
        <input type="checkbox" checked={!!word.known} onChange={(e) => onChange({ known: e.target.checked })} aria-label="Known" />
      </td>
      <td>
        <button className="icon" onClick={onRemove} aria-label={`Delete ${word.term}`}>
          ×
        </button>
      </td>
    </tr>
  );
}

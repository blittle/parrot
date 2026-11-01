import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronIcon, CheckIcon, PlayIcon } from "../components/Icons";
import { OfflinePanel } from "../components/OfflinePanel";
import { listsDb } from "../lib/db";
import { languageLabel } from "../lib/languages";
import { href, navigate } from "../lib/router";
import { displayTerm, spokenTerm } from "../lib/text";
import { getClip, resolveVoice } from "../lib/tts";
import type { Word, WordList } from "../lib/types";

export function ListPage({ id }: { id: string }) {
  const [list, setList] = useState<WordList | null | undefined>(undefined);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    listsDb.get(id).then((l) => setList(l ?? null), (e: Error) => setError(e.message));
  }, [id]);

  const visible = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (!q) return list.words;
    return list.words.filter((w) => [w.term, w.translation, w.article, w.notes].some((f) => f?.toLowerCase().includes(q)));
  }, [list, query]);

  if (list === undefined) return <p className="muted">Loading…</p>;
  if (list === null) {
    return (
      <p>
        List not found. <a href={href("lists")}>Back to lists</a>
      </p>
    );
  }

  async function save(next: WordList) {
    setList(next);
    await listsDb.put(next);
  }

  const updateWord = (wordId: string, patch: Partial<Word>) =>
    void save({ ...list, words: list.words.map((w) => (w.id === wordId ? { ...w, ...patch } : w)) });

  const removeWord = (wordId: string) => void save({ ...list, words: list.words.filter((w) => w.id !== wordId) });

  function addWord() {
    const word = { id: crypto.randomUUID(), term: "", translation: "" };
    setQuery("");
    setOpen(word.id);
    void save({ ...list!, words: [...list!.words, word] });
  }

  async function deleteList() {
    if (!confirm(`Delete "${list!.name}"? This can't be undone.`)) return;
    await listsDb.delete(list!.id);
    navigate("lists");
  }

  async function play(word: Word) {
    setError(null);
    audio.current?.pause();
    setPlaying(word.id);
    try {
      const voice = await resolveVoice(list!.languageCode);
      const clip = await getClip({ text: spokenTerm(word, list!.languageCode), languageCode: list!.languageCode, voice, speakingRate: 1 });
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
      <a className="back" href={href("lists")}>
        ‹ Lists
      </a>
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

      <a className="button primary block" href={href("practice", list.id)}>
        Practice this list
      </a>

      <OfflinePanel list={list} />

      {error && <p className="error">{error}</p>}

      {list.words.length > 8 && (
        <input className="search" type="search" placeholder="Search words" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search words" />
      )}

      <ul className="word-cards">
        {visible.map((w) => (
          <WordCard
            key={w.id}
            word={w}
            languageCode={list.languageCode}
            playing={playing === w.id}
            open={open === w.id}
            onToggle={() => setOpen(open === w.id ? null : w.id)}
            onPlay={() => void play(w)}
            onChange={(patch) => updateWord(w.id, patch)}
            onRemove={() => removeWord(w.id)}
          />
        ))}
      </ul>
      {visible.length === 0 && query && <p className="muted center">No words match "{query}".</p>}

      <div className="row-actions spread">
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

function WordCard({
  word,
  languageCode,
  playing,
  open,
  onToggle,
  onPlay,
  onChange,
  onRemove,
}: {
  word: Word;
  languageCode: string;
  playing: boolean;
  open: boolean;
  onToggle: () => void;
  onPlay: () => void;
  onChange: (patch: Partial<Word>) => void;
  onRemove: () => void;
}) {
  // Edit locally, save on blur, so typing doesn't write to IndexedDB on every keystroke.
  const [draft, setDraft] = useState(word);
  useEffect(() => {
    setDraft(word);
  }, [word]);
  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(word)) onChange(draft);
  };
  const field = (key: "article" | "term" | "translation" | "spoken" | "notes", label: string, extra: { placeholder?: string; lang?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={commit} autoCapitalize="off" {...extra} />
    </label>
  );

  return (
    <li className={`word-card${word.known ? " known" : ""}${open ? " open" : ""}`}>
      <div className="word-row">
        <button className="play" onClick={onPlay} disabled={!word.term.trim()} aria-label={`Play ${word.term}`}>
          {playing ? "…" : <PlayIcon size={18} />}
        </button>
        <button className="word-main" onClick={onToggle} aria-expanded={open}>
          <span className="word-term" lang={languageCode}>
            {displayTerm(word, languageCode) || <span className="muted">New word</span>}
          </span>
          <span className="word-translation">{word.translation}</span>
        </button>
        <button
          className={word.known ? "known-toggle on" : "known-toggle"}
          onClick={() => onChange({ known: !word.known })}
          aria-pressed={!!word.known}
          aria-label={word.known ? "Marked known" : "Mark as known"}
          title="Known words can be skipped in practice"
        >
          <CheckIcon />
        </button>
        <button className="icon chevron" onClick={onToggle} aria-label={open ? "Close" : "Edit"}>
          <ChevronIcon />
        </button>
      </div>
      {open && (
        <div className="word-edit">
          <div className="grid-article">
            {field("article", "Article", { lang: languageCode })}
            {field("term", "Word", { lang: languageCode })}
          </div>
          {field("translation", "Translation")}
          {field("spoken", "Spoken as", { placeholder: spokenTerm({ ...draft, spoken: undefined }, languageCode), lang: languageCode })}
          {field("notes", "Notes")}
          <button className="button danger" onClick={onRemove}>
            Delete word
          </button>
        </div>
      )}
    </li>
  );
}

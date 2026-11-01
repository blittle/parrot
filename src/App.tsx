import { useEffect, useMemo, useRef, useState } from "react";
import type { Voice } from "../shared/api";
import { fetchVoices, synthesize } from "./api";

const LANGUAGE = "de-DE";

// Words that tend to trip up TTS: umlauts, ß, long compounds, ch sounds, a sentence.
const SAMPLES = [
  "der Hund",
  "das Eichhörnchen",
  "die Straße",
  "Entschuldigung",
  "das Streichholzschächtelchen",
  "ich, dich, Bach, Buch",
  "Ich hätte gern zwei Brötchen, bitte.",
];

// Rough quality ranking so the best families show first.
const FAMILY_ORDER = ["Chirp3-HD", "Chirp-HD", "Studio", "Neural2", "Wavenet", "Polyglot", "Standard"];
const familyRank = (f: string) => {
  const i = FAMILY_ORDER.indexOf(f);
  return i === -1 ? FAMILY_ORDER.length : i;
};

const FAVORITES_KEY = "parrot:favorite-voices";

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {
    // Storage unavailable (private mode); favorites just won't persist.
  }
}

type RowState = { status: "idle" | "loading" | "playing" | "error"; cached?: boolean; message?: string };

export function App() {
  const [text, setText] = useState(SAMPLES[0]);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchVoices(LANGUAGE).then(setVoices, (e: Error) => setLoadError(e.message));
  }, []);

  const grouped = useMemo(() => {
    const visible = onlyFavorites ? voices.filter((v) => favorites.has(v.name)) : voices;
    const groups = new Map<string, Voice[]>();
    for (const v of visible) groups.set(v.family, [...(groups.get(v.family) ?? []), v]);
    return [...groups.entries()].sort(([a], [b]) => familyRank(a) - familyRank(b) || a.localeCompare(b));
  }, [voices, favorites, onlyFavorites]);

  const setRow = (name: string, state: RowState) => setRows((r) => ({ ...r, [name]: state }));

  async function play(voice: Voice) {
    audioRef.current?.pause();
    setRow(voice.name, { status: "loading" });
    try {
      const res = await synthesize({ text, languageCode: LANGUAGE, voice: voice.name, speakingRate: rate });
      const audio = new Audio(res.url);
      audioRef.current = audio;
      audio.onended = () => setRow(voice.name, { status: "idle", cached: res.cached });
      setRow(voice.name, { status: "playing", cached: res.cached });
      await audio.play();
    } catch (e) {
      setRow(voice.name, { status: "error", message: (e as Error).message });
    }
  }

  function toggleFavorite(name: string) {
    const next = new Set(favorites);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setFavorites(next);
    saveFavorites(next);
  }

  return (
    <main>
      <header>
        <h1>Parrot</h1>
        <p className="muted">Voice audition: compare Google German voices before building your lessons.</p>
      </header>

      <section className="controls">
        <label className="field">
          <span>Text</span>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} lang="de" />
        </label>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s} className={s === text ? "chip active" : "chip"} onClick={() => setText(s)} lang="de">
              {s}
            </button>
          ))}
        </div>
        <label className="field rate">
          <span>Speed {rate.toFixed(2)}x</span>
          <input type="range" min={0.5} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
          Only show favorites ({favorites.size})
        </label>
      </section>

      {loadError && <p className="error">Could not load voices: {loadError}</p>}
      {!loadError && voices.length === 0 && <p className="muted">Loading voices…</p>}

      {grouped.map(([family, list]) => (
        <section key={family} className="family">
          <h2>
            {family} <span className="muted">({list.length})</span>
          </h2>
          <ul>
            {list.map((v) => {
              const row = rows[v.name] ?? { status: "idle" };
              const speaker = v.name.slice(`${LANGUAGE}-${family}-`.length) || v.name;
              return (
                <li key={v.name}>
                  <button
                    className="play"
                    onClick={() => play(v)}
                    disabled={!text.trim() || row.status === "loading"}
                    aria-label={`Play ${v.name}`}
                  >
                    {row.status === "loading" ? "…" : row.status === "playing" ? "■" : "▶"}
                  </button>
                  <span className="name" title={v.name}>{speaker}</span>
                  <span className="muted small">{v.gender.toLowerCase()}</span>
                  {row.cached !== undefined && row.status !== "error" && (
                    <span className="badge">{row.cached ? "cached" : "new"}</span>
                  )}
                  {row.status === "error" && <span className="error small">{row.message}</span>}
                  <button
                    className={favorites.has(v.name) ? "star on" : "star"}
                    onClick={() => toggleFavorite(v.name)}
                    aria-label={favorites.has(v.name) ? "Remove favorite" : "Add favorite"}
                  >
                    ★
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { Voice } from "../../shared/api";
import { ALL_LANGUAGES } from "../lib/languages";
import { updateSettings, useSettings } from "../lib/settings";
import { familyRank, getClip, listVoices, resolveVoice } from "../lib/tts";
import { speakerName } from "../components/VoiceSelect";

// Phrases that tend to trip up TTS, per language.
const SAMPLES: Record<string, string[]> = {
  de: ["der Hund", "das Eichhörnchen", "die Straße", "Entschuldigung", "das Streichholzschächtelchen", "ich, dich, Bach, Buch", "Ich hätte gern zwei Brötchen, bitte."],
  fr: ["la grenouille", "l'écureuil", "un œuf, des œufs", "Je voudrais un croissant, s'il vous plaît."],
  es: ["el perro", "la ardilla", "ferrocarril", "Quisiera un café con leche, por favor."],
  it: ["lo scoiattolo", "gli gnocchi", "Vorrei un caffè, per favore."],
  en: ["squirrel", "through, though, thought", "excuse me"],
};

const FAVORITES_KEY = "parrot:favorite-voices";

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

type RowState = { status: "idle" | "loading" | "playing" | "error"; cached?: boolean; message?: string };

export function VoicesPage() {
  const settings = useSettings();
  const [languageCode, setLanguageCode] = useState("de-DE");
  const samples = SAMPLES[languageCode.slice(0, 2)] ?? [];
  const [text, setText] = useState(samples[0] ?? "");
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [defaultVoice, setDefaultVoice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setVoices(null);
    setLoadError(null);
    listVoices(languageCode).then(setVoices, (e: Error) => setLoadError(e.message));
    resolveVoice(languageCode).then(setDefaultVoice, () => setDefaultVoice(null));
  }, [languageCode, settings.apiKey, settings.voices]);

  function changeLanguage(code: string) {
    setLanguageCode(code);
    setText(SAMPLES[code.slice(0, 2)]?.[0] ?? "");
    setRows({});
  }

  const grouped = useMemo(() => {
    const visible = (voices ?? []).filter((v) => !onlyFavorites || favorites.has(v.name));
    const groups = new Map<string, Voice[]>();
    for (const v of visible) groups.set(v.family, [...(groups.get(v.family) ?? []), v]);
    return [...groups.entries()].sort(([a], [b]) => familyRank(a) - familyRank(b) || a.localeCompare(b));
  }, [voices, favorites, onlyFavorites]);

  const setRow = (name: string, state: RowState) => setRows((r) => ({ ...r, [name]: state }));

  async function play(voice: Voice) {
    audioRef.current?.pause();
    setRow(voice.name, { status: "loading" });
    try {
      const clip = await getClip({ text: text.trim(), languageCode, voice: voice.name, speakingRate: rate });
      const url = URL.createObjectURL(clip.blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setRow(voice.name, { status: "idle", cached: clip.cached });
      };
      setRow(voice.name, { status: "playing", cached: clip.cached });
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
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    } catch {
      // Favorites just won't persist.
    }
  }

  function makeDefault(name: string) {
    updateSettings({ voices: { ...settings.voices, [languageCode]: name } });
  }

  return (
    <>
      <h1>Voices</h1>
      <p className="muted">Compare Google's voices and choose the default for each language. Your lists use the default voice.</p>

      <section className="panel">
        <div className="grid-2">
          <label className="field">
            <span>Language</span>
            <select value={languageCode} onChange={(e) => changeLanguage(e.target.value)}>
              {ALL_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Speed {rate.toFixed(2)}x</span>
            <input type="range" min={0.5} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Text</span>
          <input className="big" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} lang={languageCode} />
        </label>
        <div className="presets">
          {samples.map((s) => (
            <button key={s} className={s === text ? "chip active" : "chip"} onClick={() => setText(s)} lang={languageCode}>
              {s}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
          Only show favorites ({favorites.size})
        </label>
        {defaultVoice && (
          <p className="small">
            Default voice: <strong>{defaultVoice}</strong>
            {!settings.voices[languageCode] && <span className="muted"> (automatic, best available)</span>}
          </p>
        )}
      </section>

      {loadError && <p className="error">Could not load voices: {loadError}</p>}
      {!loadError && voices === null && <p className="muted">Loading voices…</p>}

      {grouped.map(([family, list]) => (
        <section key={family} className="family">
          <h2>
            {family} <span className="muted">({list.length})</span>
          </h2>
          <ul>
            {list.map((v) => {
              const row = rows[v.name] ?? { status: "idle" };
              const speaker = speakerName(v);
              const isDefault = v.name === defaultVoice;
              return (
                <li key={v.name}>
                  <button className="play" onClick={() => void play(v)} disabled={!text.trim() || row.status === "loading"} aria-label={`Play ${v.name}`}>
                    {row.status === "loading" ? "…" : row.status === "playing" ? "■" : "▶"}
                  </button>
                  <span className="name" title={v.name}>
                    {speaker}
                  </span>
                  <span className="muted small">{v.gender.toLowerCase()}</span>
                  {row.cached !== undefined && row.status !== "error" && <span className="badge">{row.cached ? "cached" : "new"}</span>}
                  {row.status === "error" && <span className="error small">{row.message}</span>}
                  <span className="spacer" />
                  {isDefault ? (
                    <span className="badge accent">default</span>
                  ) : (
                    <button className="link" onClick={() => makeDefault(v.name)}>
                      Use
                    </button>
                  )}
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
    </>
  );
}

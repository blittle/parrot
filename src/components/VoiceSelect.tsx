import { useEffect, useMemo, useRef, useState } from "react";
import type { Voice } from "../../shared/api";
import { languageLabel } from "../lib/languages";
import { updateSettings, useSettings } from "../lib/settings";
import { familyRank, getClip, listVoices, resolveVoice } from "../lib/tts";

/** "de-DE-Chirp3-HD-Aoede" -> "Aoede". */
export function speakerName(voice: Voice): string {
  return voice.name.slice(`${voice.languageCode}-${voice.family}-`.length) || voice.name;
}

/**
 * Picks the default voice for a language. The choice is saved per language,
 * so it applies to every list and the Voices page too.
 */
export function VoiceSelect({ languageCode, label, sampleText }: { languageCode: string; label: string; sampleText: string }) {
  const settings = useSettings();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setError(null);
    listVoices(languageCode).then(setVoices, (e: Error) => setError(e.message));
    resolveVoice(languageCode).then(setCurrent, () => setCurrent(null));
  }, [languageCode, settings.apiKey, settings.voices]);

  const groups = useMemo(() => {
    const map = new Map<string, Voice[]>();
    for (const v of voices ?? []) map.set(v.family, [...(map.get(v.family) ?? []), v]);
    return [...map.entries()].sort(([a], [b]) => familyRank(a) - familyRank(b) || a.localeCompare(b));
  }, [voices]);

  async function preview() {
    if (!current || !sampleText.trim()) return;
    audio.current?.pause();
    setPlaying(true);
    setError(null);
    try {
      const clip = await getClip({ text: sampleText.trim(), languageCode, voice: current, speakingRate: 1 });
      const url = URL.createObjectURL(clip.blob);
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
      };
      await el.play();
    } catch (e) {
      setError((e as Error).message);
      setPlaying(false);
    }
  }

  return (
    <div className="field">
      <span>
        {label} <span className="muted">({languageLabel(languageCode)})</span>
      </span>
      <div className="input-row">
        <select
          value={current ?? ""}
          disabled={!voices}
          onChange={(e) => updateSettings({ voices: { ...settings.voices, [languageCode]: e.target.value } })}
          aria-label={`${label} voice`}
        >
          {!voices && <option value="">{error ? "Unavailable" : "Loading voices…"}</option>}
          {groups.map(([family, list]) => (
            <optgroup key={family} label={family}>
              {list.map((v) => (
                <option key={v.name} value={v.name}>
                  {speakerName(v)} · {v.gender.toLowerCase()} · {family}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="play" onClick={() => void preview()} disabled={!current || playing} aria-label={`Preview ${label} voice`}>
          {playing ? "…" : "▶"}
        </button>
      </div>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

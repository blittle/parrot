import { useEffect, useMemo, useState } from "react";
import { listsDb } from "../lib/db";
import { renderSession, estimateSeconds, type RenderedSession, type RenderProgress } from "../lib/render";
import { navigate, href } from "../lib/router";
import { buildPlan, DEFAULT_OPTIONS, PRESETS, selectWords, type Plan, type Sequence, type SessionOptions, type Step } from "../lib/sequence";
import { resolveVoice } from "../lib/tts";
import type { WordList } from "../lib/types";
import { Player } from "./Player";

const PRACTICE_KEY = "parrot:practice";

interface Saved {
  sequence: Sequence;
  options: SessionOptions;
}

function loadSaved(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? "null") as Saved | null;
    if (saved?.sequence?.steps && saved.options) return { sequence: saved.sequence, options: { ...DEFAULT_OPTIONS, ...saved.options } };
  } catch {
    // Fall through to defaults.
  }
  return { sequence: structuredClone(PRESETS[0]), options: DEFAULT_OPTIONS };
}

function persist(saved: Saved) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(saved));
  } catch {
    // Not critical.
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

export function PracticePage({ listId }: { listId?: string }) {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [saved, setSaved] = useState(loadSaved);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ rendered: RenderedSession; plan: Plan; list: WordList; title: string } | null>(null);

  useEffect(() => {
    listsDb.all().then(setLists, (e: Error) => setError(e.message));
  }, []);

  const list = lists?.find((l) => l.id === listId) ?? (listId ? undefined : lists?.[0]);
  const { sequence, options } = saved;

  const update = (patch: Partial<Saved>) => {
    const next = { ...saved, ...patch };
    setSaved(next);
    persist(next);
  };
  const setOptions = (patch: Partial<SessionOptions>) => update({ options: { ...options, ...patch } });
  const setSteps = (steps: Step[]) => update({ sequence: { ...sequence, id: "custom", steps } });

  const selectedCount = list ? selectWords(list.words, options).length : 0;
  const estimate = useMemo(() => {
    if (!list) return 0;
    // Voices don't affect length, so placeholders are fine for the estimate.
    return estimateSeconds(buildPlan(list, sequence, options, { term: "x", translation: "x" }));
  }, [list, sequence, options]);

  async function start() {
    if (!list) return;
    setError(null);
    setSession(null);
    if (estimate > 90 * 60 && !confirm(`This session is about ${formatDuration(estimate)} long. Continue?`)) return;
    try {
      setProgress({ phase: "audio", done: 0, total: 0 });
      const usesTranslation = sequence.steps.some((s) => s.type === "translation");
      const [term, translation] = await Promise.all([
        resolveVoice(list.languageCode),
        usesTranslation ? resolveVoice(list.translationLanguageCode) : Promise.resolve(""),
      ]);
      const plan = buildPlan(list, sequence, options, { term, translation });
      if (!plan.items.some((i) => i.kind === "clip")) throw new Error("Nothing to play. Check the word range and sequence steps.");
      const rendered = await renderSession(plan, setProgress);
      setSession({ rendered, plan, list, title: `${list.name} · ${sequence.name}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  if (lists === null) return <p className="muted">Loading…</p>;
  if (lists.length === 0) {
    return (
      <div className="empty">
        <p>Import a word list first.</p>
        <a className="button primary" href={href("import")}>
          Import list
        </a>
      </div>
    );
  }

  return (
    <>
      <h1>Practice</h1>

      {session && <Player key={session.rendered.wav.size + session.title} {...session} />}

      <section className="panel">
        <label className="field">
          <span>List</span>
          <select value={list?.id ?? ""} onChange={(e) => navigate("practice", e.target.value)}>
            {!list && <option value="">Choose a list</option>}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.words.length})
              </option>
            ))}
          </select>
        </label>

        <h2>Sequence</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={sequence.id === p.id ? "chip active" : "chip"}
              onClick={() => update({ sequence: structuredClone(p) })}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
          {sequence.id === "custom" && <span className="chip active">Custom</span>}
        </div>
        <p className="muted small">{sequence.id === "custom" ? "Your own sequence." : sequence.description}</p>
        <StepEditor steps={sequence.steps} onChange={setSteps} />

        <h2>Words</h2>
        <div className="grid-4">
          <label className="field">
            <span>Order</span>
            <select value={options.order} onChange={(e) => setOptions({ order: e.target.value as SessionOptions["order"] })}>
              <option value="list">As listed</option>
              <option value="shuffle">Shuffled</option>
            </select>
          </label>
          <label className="field">
            <span>Start at word</span>
            <input type="number" min={1} value={options.start + 1} onChange={(e) => setOptions({ start: Math.max(0, Number(e.target.value) - 1) })} />
          </label>
          <label className="field">
            <span>How many (0 = all)</span>
            <input type="number" min={0} value={options.count} onChange={(e) => setOptions({ count: Math.max(0, Number(e.target.value)) })} />
          </label>
          <label className="field">
            <span>Times through</span>
            <input type="number" min={1} max={20} value={options.loops} onChange={(e) => setOptions({ loops: Math.min(20, Math.max(1, Number(e.target.value))) })} />
          </label>
          <label className="field">
            <span>Gap between words (s)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={options.wordGapMs / 1000}
              onChange={(e) => setOptions({ wordGapMs: Math.max(0, Number(e.target.value) * 1000) })}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={options.skipKnown} onChange={(e) => setOptions({ skipKnown: e.target.checked })} />
            Skip known words
          </label>
        </div>

        <div className="start">
          <button className="button primary large" onClick={() => void start()} disabled={!list || !!progress || selectedCount === 0}>
            {progress ? "Preparing…" : "Build session"}
          </button>
          <span className="muted small">
            {selectedCount} words{options.loops > 1 ? ` × ${options.loops}` : ""} · about {formatDuration(estimate)}
          </span>
        </div>
        {progress && (
          <div className="progress">
            {progress.phase === "audio" ? (
              <>
                <progress value={progress.done} max={progress.total || 1} />
                <span className="muted small">
                  Getting audio {progress.done}/{progress.total} (cached clips are instant)
                </span>
              </>
            ) : (
              <>
                <progress />
                <span className="muted small">Assembling session…</span>
              </>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}

function StepEditor({ steps, onChange }: { steps: Step[]; onChange: (steps: Step[]) => void }) {
  const set = (i: number, step: Step) => onChange(steps.map((s, j) => (j === i ? step : s)));
  const move = (i: number, d: number) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const changeType = (i: number, type: Step["type"]) =>
    set(i, type === "pause" ? { type, ms: 2000 } : { type, repeat: 1, rate: 1, gapMs: 1500 });

  return (
    <ol className="steps">
      {steps.map((step, i) => (
        <li key={i}>
          <select value={step.type} onChange={(e) => changeType(i, e.target.value as Step["type"])} aria-label="Step type">
            <option value="term">Say the word</option>
            <option value="translation">Say the translation</option>
            <option value="pause">Pause</option>
          </select>
          {step.type === "pause" ? (
            <label>
              <input type="number" min={0} step={0.5} value={step.ms / 1000} onChange={(e) => set(i, { ...step, ms: Math.max(0, Number(e.target.value) * 1000) })} /> s
            </label>
          ) : (
            <>
              <label>
                ×
                <input type="number" min={1} max={10} value={step.repeat} onChange={(e) => set(i, { ...step, repeat: Math.min(10, Math.max(1, Number(e.target.value))) })} />
              </label>
              <label>
                speed
                <select value={step.rate} onChange={(e) => set(i, { ...step, rate: Number(e.target.value) })}>
                  {[0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25].map((r) => (
                    <option key={r} value={r}>
                      {r}x
                    </option>
                  ))}
                </select>
              </label>
              <label>
                then
                <input type="number" min={0} step={0.5} value={step.gapMs / 1000} onChange={(e) => set(i, { ...step, gapMs: Math.max(0, Number(e.target.value) * 1000) })} /> s
              </label>
            </>
          )}
          <span className="step-actions">
            <button className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
              ↑
            </button>
            <button className="icon" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">
              ↓
            </button>
            <button className="icon" onClick={() => onChange(steps.filter((_, j) => j !== i))} disabled={steps.length === 1} aria-label="Remove step">
              ×
            </button>
          </span>
        </li>
      ))}
      <li>
        <button className="button" onClick={() => onChange([...steps, { type: "term", repeat: 1, rate: 1, gapMs: 1500 }])}>
          Add step
        </button>
      </li>
    </ol>
  );
}

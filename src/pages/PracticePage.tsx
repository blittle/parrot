import { useEffect, useMemo, useState } from "react";
import { FlameIcon } from "../components/Icons";
import { Parrot } from "../components/Parrot";
import { VoiceSelect } from "../components/VoiceSelect";
import { listsDb, sessionsDb, type SavedSession } from "../lib/db";
import { greeting } from "../lib/languages";
import { startDownload } from "../lib/offline";
import { loadPractice, savePractice, type PracticeSettings } from "../lib/practice";
import { preparePlan, type PreparedPlan } from "../lib/prepare";
import { estimateSeconds, renderSession, type RenderProgress } from "../lib/render";
import { href, navigate } from "../lib/router";
import { buildPlan, PRESETS, selectWords, type SessionOptions, type Step } from "../lib/sequence";
import { currentStreak, loadStreak, localDate } from "../lib/streak";
import { spokenTerm } from "../lib/text";
import { resolveVoice } from "../lib/tts";
import type { WordList } from "../lib/types";
import { Player } from "./Player";

// Sessions longer than this aren't kept for resuming, to keep storage modest (~170 MB/hour as WAV).
const MAX_SAVED_SECONDS = 60 * 60;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

export function PracticePage({ listId }: { listId?: string }) {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [saved, setSaved] = useState(loadPractice);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ data: SavedSession; fresh: boolean } | null>(null);
  const [partial, setPartial] = useState<PreparedPlan | null>(null);
  const streak = currentStreak(loadStreak().days, localDate());

  useEffect(() => {
    listsDb.all().then(setLists, (e: Error) => setError(e.message));
    // Bring back the last session so it can be resumed, even offline.
    sessionsDb.get().then(
      (last) => last && setSession((current) => current ?? { data: last, fresh: false }),
      () => {},
    );
  }, []);

  const list = lists?.find((l) => l.id === listId) ?? (listId ? undefined : lists?.find((l) => l.id === session?.data.listId) ?? lists?.[0]);
  const { sequence, options } = saved;

  const update = (patch: Partial<PracticeSettings>) => {
    const next = { ...saved, ...patch };
    setSaved(next);
    savePractice(next);
  };
  const setOptions = (patch: Partial<SessionOptions>) => update({ options: { ...options, ...patch } });
  const setSteps = (steps: Step[]) => update({ sequence: { ...sequence, id: "custom", name: "Custom", steps } });

  const usesTranslation = sequence.steps.some((s) => s.type === "translation");
  const selectedCount = list ? selectWords(list.words, options).length : 0;
  const estimate = useMemo(() => {
    if (!list) return 0;
    // Voices don't affect length, so placeholders are fine for the estimate.
    return estimateSeconds(buildPlan(list, sequence, options, { term: "x", translation: "x" }));
  }, [list, sequence, options]);

  async function start() {
    if (!list) return;
    setError(null);
    setPartial(null);
    if (estimate > 90 * 60 && !confirm(`This session is about ${formatDuration(estimate)} long. Continue?`)) return;
    try {
      setProgress({ phase: "audio", done: 0, total: 0 });
      const [term, translation] = await Promise.all([
        resolveVoice(list.languageCode),
        usesTranslation ? resolveVoice(list.translationLanguageCode) : Promise.resolve(""),
      ]);
      const fullPlan = buildPlan(list, sequence, options, { term, translation });
      if (!fullPlan.items.some((i) => i.kind === "clip")) throw new Error("Nothing to play. Check the word range and sequence steps.");
      // Start with whatever audio is ready; words still downloading are left out.
      const prepared = await preparePlan(fullPlan, setProgress);
      const plan = prepared.plan;
      if (!plan.items.some((i) => i.kind === "clip")) throw prepared.error ?? new Error("No audio is available for this list yet.");
      if (prepared.skippedWords > 0) {
        setPartial(prepared);
        // Keep fetching the rest in the background so the next session has them.
        if (navigator.onLine) startDownload(list).catch(() => {});
      }
      const rendered = await renderSession(plan, setProgress);
      const data: SavedSession = {
        id: "last",
        wav: rendered.wav,
        duration: rendered.duration,
        segments: rendered.segments,
        slots: plan.slots,
        listId: list.id,
        languageCode: list.languageCode,
        title: `${list.name} · ${sequence.name}`,
        createdAt: Date.now(),
      };
      setSession({ data, fresh: true });
      if (rendered.duration <= MAX_SAVED_SECONDS) sessionsDb.put(data).catch(() => {});
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
        <Parrot mood="idle" size={140} />
        <h1>Nothing to repeat yet</h1>
        <p className="muted">Give me a word list and I'll start talking. A spreadsheet or a quick paste works.</p>
        <a className="button primary large" href={href("import")}>
          Import a list
        </a>
      </div>
    );
  }

  return (
    <>
      {session && <Player key={session.data.createdAt} session={session.data} autoPlay={session.fresh} />}
      {session && partial && (
        <div className="notice">
          Playing {partial.keptWords} of {partial.keptWords + partial.skippedWords} words.{" "}
          {partial.reason === "offline"
            ? `The other ${partial.skippedWords} aren't downloaded yet; connect to the internet to get them.`
            : partial.reason === "quota"
              ? `The other ${partial.skippedWords} are still downloading (Google's per-minute limit) and will be in your next session.`
              : partial.reason === "signin"
                ? `Your sign-in has expired, so the other ${partial.skippedWords} couldn't download. Reload Parrot to sign in again.`
              : partial.reason === "downloading"
                ? `The other ${partial.skippedWords} are still downloading and will be in your next session.`
                : `The other ${partial.skippedWords} couldn't be downloaded right now and will be retried.`}
        </div>
      )}

      {!session && (
        <div className="hello">
          <Parrot mood="idle" size={72} />
          <div>
            <h1 lang={list?.languageCode}>{greeting(list?.languageCode ?? "de-DE", new Date().getHours())}</h1>
            {streak > 0 ? (
              <span className="streak">
                <FlameIcon /> {streak}-day streak
              </span>
            ) : (
              <span className="muted small">Finish a session to start a streak.</span>
            )}
          </div>
        </div>
      )}

      <section className="panel">
        <h2 className="panel-title">{session ? "New session" : "Ready when you are"}</h2>
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

        <div className="field">
          <span>Sequence</span>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={sequence.id === p.id ? "chip active" : "chip"} onClick={() => update({ sequence: structuredClone(p) })}>
                {p.name}
              </button>
            ))}
            {sequence.id === "custom" && <span className="chip active">Custom</span>}
          </div>
          <span className="muted small">{sequence.id === "custom" ? "Your own steps, below." : sequence.description}</span>
        </div>

        <button className="button primary large block" onClick={() => void start()} disabled={!list || !!progress || selectedCount === 0}>
          {progress ? "Preparing…" : "Start session"}
        </button>
        <span className="muted small center">
          {selectedCount} words{options.loops > 1 ? ` × ${options.loops}` : ""} · about {formatDuration(estimate)}
        </span>

        {progress && (
          <div className="progress">
            {progress.phase === "audio" ? (
              <>
                <progress value={progress.done} max={progress.total || 1} />
                <span className="muted small">
                  {progress.waiting
                    ? `Google's per-minute limit reached. Continuing shortly… (${progress.done}/${progress.total})`
                    : `Gathering words ${progress.done}/${progress.total}`}
                </span>
              </>
            ) : (
              <>
                <progress />
                <span className="muted small">Warming up the parrot…</span>
              </>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {list && (
        <details className="panel customize">
          <summary>Customize voices, steps and words</summary>

          <h2>Voices</h2>
          <VoiceSelect languageCode={list.languageCode} label="Word voice" sampleText={list.words[0] ? spokenTerm(list.words[0], list.languageCode) : ""} />
          {usesTranslation && (
            <VoiceSelect
              languageCode={list.translationLanguageCode}
              label="Translation voice"
              sampleText={list.words.find((w) => w.translation)?.translation ?? ""}
            />
          )}
          <p className="muted small">
            Saved for each language. <a href={href("voices")}>Compare all voices</a>
          </p>

          <h2>Steps for each word</h2>
          <StepEditor steps={sequence.steps} onChange={setSteps} />

          <h2>Words</h2>
          <div className="grid-2">
            <label className="field">
              <span>Order</span>
              <select value={options.order} onChange={(e) => setOptions({ order: e.target.value as SessionOptions["order"] })}>
                <option value="list">As listed</option>
                <option value="shuffle">Shuffled</option>
              </select>
            </label>
            <label className="field">
              <span>Times through</span>
              <input type="number" inputMode="numeric" min={1} max={20} value={options.loops} onChange={(e) => setOptions({ loops: Math.min(20, Math.max(1, Number(e.target.value))) })} />
            </label>
            <label className="field">
              <span>Start at word</span>
              <input type="number" inputMode="numeric" min={1} value={options.start + 1} onChange={(e) => setOptions({ start: Math.max(0, Number(e.target.value) - 1) })} />
            </label>
            <label className="field">
              <span>How many (0 = all)</span>
              <input type="number" inputMode="numeric" min={0} value={options.count} onChange={(e) => setOptions({ count: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label className="field">
              <span>Pause between words (s)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={options.wordGapMs / 1000}
                onChange={(e) => setOptions({ wordGapMs: Math.max(0, Number(e.target.value) * 1000) })}
              />
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={options.skipKnown} onChange={(e) => setOptions({ skipKnown: e.target.checked })} />
            Skip words marked known
          </label>
        </details>
      )}
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
  const changeType = (i: number, type: Step["type"]) => set(i, type === "pause" ? { type, ms: 2000 } : { type, repeat: 1, rate: 1, gapMs: 1500 });

  return (
    <ol className="steps">
      {steps.map((step, i) => (
        <li key={i} className="step">
          <div className="step-head">
            <span className="step-num">{i + 1}</span>
            <select value={step.type} onChange={(e) => changeType(i, e.target.value as Step["type"])} aria-label="Step type">
              <option value="term">Say the word</option>
              <option value="translation">Say the translation</option>
              <option value="pause">Pause</option>
            </select>
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
          </div>
          {step.type === "pause" ? (
            <div className="step-fields">
              <label>
                Seconds
                <input type="number" inputMode="decimal" min={0} step={0.5} value={step.ms / 1000} onChange={(e) => set(i, { ...step, ms: Math.max(0, Number(e.target.value) * 1000) })} />
              </label>
            </div>
          ) : (
            <div className="step-fields">
              <label>
                Times
                <input type="number" inputMode="numeric" min={1} max={10} value={step.repeat} onChange={(e) => set(i, { ...step, repeat: Math.min(10, Math.max(1, Number(e.target.value))) })} />
              </label>
              <label>
                Speed
                <select value={step.rate} onChange={(e) => set(i, { ...step, rate: Number(e.target.value) })}>
                  {[0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25].map((r) => (
                    <option key={r} value={r}>
                      {r}x
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pause after (s)
                <input type="number" inputMode="decimal" min={0} step={0.5} value={step.gapMs / 1000} onChange={(e) => set(i, { ...step, gapMs: Math.max(0, Number(e.target.value) * 1000) })} />
              </label>
            </div>
          )}
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

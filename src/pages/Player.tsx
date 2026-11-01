import { useEffect, useRef, useState } from "react";
import { Confetti } from "../components/Confetti";
import { DownloadIcon, FlameIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon } from "../components/Icons";
import { Parrot } from "../components/Parrot";
import { Term } from "../components/Term";
import type { SavedSession } from "../lib/db";
import { praise } from "../lib/languages";
import { currentStreak, loadStreak, localDate, recordSession, saveStreak } from "../lib/streak";
import { displayTerm } from "../lib/text";

const RESUME_KEY = "parrot:resume";

function loadPosition(createdAt: number): number {
  try {
    const saved = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as { createdAt: number; position: number } | null;
    return saved?.createdAt === createdAt ? saved.position : 0;
  } catch {
    return 0;
  }
}

function savePosition(createdAt: number, position: number) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ createdAt, position }));
  } catch {
    // Resume just starts from the top.
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const RECORDED_KEY = "parrot:recorded-session";

/** Counts a finished session toward the streak, once per session. Returns the streak. */
function recordFinished(session: SavedSession): number {
  const today = localDate();
  let data = loadStreak();
  let already = false;
  try {
    already = localStorage.getItem(RECORDED_KEY) === String(session.createdAt);
    localStorage.setItem(RECORDED_KEY, String(session.createdAt));
  } catch {
    // Worst case a replay counts twice toward total words.
  }
  if (!already) {
    data = recordSession(data, today, session.segments.length);
    saveStreak(data);
  }
  return currentStreak(data.days, today);
}

export function Player({ session, autoPlay }: { session: SavedSession; autoPlay: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [time, setTime] = useState(() => loadPosition(session.createdAt));
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [celebrate, setCelebrate] = useState<{ streak: number } | null>(null);
  const lastSaved = useRef(0);

  // Create and revoke the object URL in one effect so StrictMode's double run can't revoke a URL still in use.
  useEffect(() => {
    const next = URL.createObjectURL(session.wav);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [session.wav]);

  // On phones the Build button is below the player, so bring the player into view.
  useEffect(() => {
    if (autoPlay) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoPlay]);

  const { segments, slots, languageCode, title } = session;
  const findIndex = (t: number) => {
    const i = segments.findIndex((s) => t >= s.start && t < s.end);
    return i === -1 ? segments.length - 1 : i;
  };
  const index = findIndex(time);
  const word = slots[segments[index]?.slot ?? 0];
  const finished = time >= session.duration - 0.05;

  const seek = (t: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, t), session.duration);
    setTime(el.currentTime);
  };
  const next = () => {
    if (index + 1 < segments.length) seek(segments[index + 1].start);
  };
  // Like a music player: restart the current word unless we're at its very beginning.
  const prev = () => {
    if (time - segments[index].start > 1.5 || index === 0) seek(segments[index].start);
    else seek(segments[index - 1].start);
  };
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setCelebrate(null);
      if (finished) seek(0);
      el.play().catch(() => setPlaying(false));
    } else el.pause();
  };

  // Lock screen / headphone controls and the track info shown there.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || !word) return;
    ms.metadata = new MediaMetadata({
      title: displayTerm(word, languageCode),
      artist: word.translation,
      album: title,
      artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
  }, [word, languageCode, title]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["previoustrack", prev],
      ["nexttrack", next],
      ["play", () => void audio.current?.play()],
      ["pause", () => audio.current?.pause()],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Action not supported in this browser.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // Ignore.
        }
      }
    };
  });

  const fileName = `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "parrot-session"}.wav`;
  const sizeMb = (session.wav.size / 1024 / 1024).toFixed(1);

  return (
    <section className="player" ref={panel} aria-label="Player">
      <div className="player-head">
        <Parrot mood={celebrate ? "happy" : playing ? "talking" : "idle"} size={56} />
        <div className="player-title">
          <strong>{title}</strong>
          <span className="muted small">
            Word {index + 1} of {segments.length}
          </span>
        </div>
      </div>

      {celebrate ? (
        <div className="complete">
          <Confetti />
          <div className="complete-title" lang={languageCode}>
            {praise(languageCode)}
          </div>
          <p className="muted">
            {segments.length} words in {clock(session.duration)}
          </p>
          {celebrate.streak > 0 && (
            <span className="streak big-streak">
              <FlameIcon /> {celebrate.streak}-day streak
            </span>
          )}
          <button
            className="button primary"
            onClick={() => {
              setCelebrate(null);
              seek(0);
              void audio.current?.play();
            }}
          >
            <RepeatIcon /> Once more
          </button>
        </div>
      ) : (
        <div className="now" onClick={() => setShowTranslation(true)}>
          <div className="term" key={index}>
            {word ? <Term word={word} languageCode={languageCode} /> : ""}
          </div>
          <div className={showTranslation ? "translation" : "translation hidden"}>{word?.translation || "\u00a0"}</div>
          {word?.notes && <div className="muted small">{word.notes}</div>}
        </div>
      )}

      <input
        className="scrubber"
        type="range"
        min={0}
        max={session.duration}
        step={0.1}
        value={Math.min(time, session.duration)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Position"
      />
      <div className="times muted small">
        <span>{clock(time)}</span>
        <span>-{clock(session.duration - time)}</span>
      </div>

      <div className="transport">
        <button className="round" onClick={prev} aria-label="Previous word">
          <PrevIcon />
        </button>
        <button className="round big" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </button>
        <button className="round" onClick={next} aria-label="Next word" disabled={index + 1 >= segments.length}>
          <NextIcon />
        </button>
      </div>

      <div className="player-options">
        <label className="toggle">
          <input type="checkbox" checked={showTranslation} onChange={(e) => setShowTranslation(e.target.checked)} />
          Show translation
        </label>
        {url && (
          <a className="link small" href={url} download={fileName}>
            <DownloadIcon size={16} /> Save audio ({sizeMb} MB)
          </a>
        )}
      </div>

      {url && (
        <audio
          ref={audio}
          src={url}
          preload="auto"
          autoPlay={autoPlay}
          onLoadedMetadata={(e) => {
            const start = loadPosition(session.createdAt);
            if (start > 0 && start < session.duration - 0.5) e.currentTarget.currentTime = start;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            savePosition(session.createdAt, audio.current?.currentTime ?? 0);
          }}
          onEnded={() => {
            setPlaying(false);
            setCelebrate({ streak: recordFinished(session) });
            navigator.vibrate?.([30, 60, 30]);
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setTime(t);
            if (Math.abs(t - lastSaved.current) > 3) {
              lastSaved.current = t;
              savePosition(session.createdAt, t);
            }
          }}
        />
      )}
    </section>
  );
}

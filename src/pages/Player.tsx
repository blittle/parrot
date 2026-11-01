import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderedSession } from "../lib/render";
import type { Plan } from "../lib/sequence";
import { displayTerm } from "../lib/text";
import type { WordList } from "../lib/types";

interface Props {
  rendered: RenderedSession;
  plan: Plan;
  list: WordList;
  title: string;
}

export function Player({ rendered, plan, list, title }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLElement>(null);
  const url = useMemo(() => URL.createObjectURL(rendered.wav), [rendered.wav]);
  const [index, setIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(true);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // On phones the Build button is far below the player, so bring the player into view.
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const { segments } = rendered;
  const word = plan.slots[segments[index]?.slot ?? 0];

  const findIndex = (t: number) => {
    const i = segments.findIndex((s) => t >= s.start && t < s.end);
    return i === -1 ? segments.length - 1 : i;
  };

  const seekTo = (i: number) => {
    const el = audio.current;
    if (!el || i < 0 || i >= segments.length) return;
    el.currentTime = segments[i].start;
    setIndex(i);
  };

  const next = () => seekTo(index + 1);
  // Like a music player: restart the current word unless we're at its very beginning.
  const prev = () => {
    const el = audio.current;
    if (el && el.currentTime - segments[index].start > 1.5) seekTo(index);
    else seekTo(index - 1);
  };

  // Lock screen / headphone controls.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || !word) return;
    ms.metadata = new MediaMetadata({
      title: displayTerm(word, list.languageCode),
      artist: word.translation,
      album: title,
    });
  }, [word, list.languageCode, title]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["previoustrack", prev],
      ["nexttrack", next],
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
  const sizeMb = (rendered.wav.size / 1024 / 1024).toFixed(1);

  return (
    <section className="panel player" ref={panel}>
      <div className="now">
        <div className="muted small">
          Word {index + 1} of {segments.length}
        </div>
        <div className="term" lang={list.languageCode}>
          {word ? displayTerm(word, list.languageCode) : ""}
        </div>
        <div className={showTranslation ? "translation" : "translation hidden"} onClick={() => setShowTranslation(true)}>
          {word?.translation}
        </div>
        {word?.notes && <div className="muted small">{word.notes}</div>}
      </div>

      <audio
        ref={audio}
        src={url}
        controls
        autoPlay
        onTimeUpdate={(e) => {
          const i = findIndex(e.currentTarget.currentTime);
          if (i !== index) setIndex(i);
        }}
      />

      <div className="row-actions">
        <button className="button" onClick={prev} aria-label="Previous word">
          ⏮ Previous
        </button>
        <button className="button" onClick={next} aria-label="Next word">
          Next ⏭
        </button>
        <label className="toggle">
          <input type="checkbox" checked={showTranslation} onChange={(e) => setShowTranslation(e.target.checked)} />
          Show translation
        </label>
        <a className="button" href={url} download={fileName}>
          Download ({sizeMb} MB)
        </a>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { activeDownload, followDownload, offlineStatus, startDownload, type OfflineStatus } from "../lib/offline";
import { useOnline } from "../lib/pwa";
import { useSettings } from "../lib/settings";
import type { WordList } from "../lib/types";
import { CheckIcon, DownloadIcon } from "./Icons";

const AUTO_KEY = "parrot:auto-download";

/** Ask the list page to start downloading as soon as it opens (used right after an import). */
export function requestAutoDownload(listId: string): void {
  try {
    sessionStorage.setItem(AUTO_KEY, listId);
  } catch {
    // Not critical; the user can tap Download.
  }
}

function takeAutoDownload(listId: string): boolean {
  try {
    if (sessionStorage.getItem(AUTO_KEY) !== listId) return false;
    sessionStorage.removeItem(AUTO_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Shows how much of a list is playable offline, and downloads the rest. */
export function OfflinePanel({ list }: { list: WordList }) {
  const online = useOnline();
  const settings = useSettings();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(() => {
    offlineStatus(list).then(setStatus, (e: Error) => setError(e.message));
  }, [list]);

  /** Shows progress of the list's download (new or already running) until it ends. */
  const watch = useCallback(
    (promise: Promise<void>) => {
      setDownloading(true);
      setError(null);
      const stop = followDownload(list.id, (s) => {
        if (s && s.total > 0) setStatus(s);
      });
      promise
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          stop();
          setDownloading(false);
          refresh();
        });
      return stop;
    },
    [list.id, refresh],
  );

  const download = useCallback(async () => {
    watch(startDownload(list));
  }, [list, watch]);

  useEffect(() => {
    refresh();
  }, [refresh, settings.voices]);

  // A download started elsewhere (after import, or by Practice) is still running: follow it.
  useEffect(() => {
    const running = activeDownload(list.id);
    if (!running) return;
    if (running.status.total > 0) setStatus(running.status);
    return watch(running.promise);
  }, [list.id, watch]);

  useEffect(() => {
    if (!started.current && online && takeAutoDownload(list.id)) {
      started.current = true;
      void download();
    }
  }, [list.id, online, download]);

  const done = status && status.total > 0 && status.ready === status.total;

  return (
    <section className={done ? "offline-panel ready" : "offline-panel"}>
      <div className="offline-row">
        <div>
          <strong>{done ? "Ready offline" : downloading ? "Downloading audio…" : "Audio for offline use"}</strong>
          {done && <div className="small">All set for airplane mode.</div>}
          <div className="muted small">
            {status ? `${status.ready} of ${status.total} clips saved on this device` : error ? "" : "Checking…"}
          </div>
        </div>
        {done ? (
          <span className="ok-mark" aria-hidden="true">
            <CheckIcon />
          </span>
        ) : (
          <button className="button primary" onClick={() => void download()} disabled={downloading || !online || !status}>
            <DownloadIcon />
            {downloading ? "Saving" : "Download"}
          </button>
        )}
      </div>
      {(downloading || (status && !done && status.ready > 0)) && status && (
        <progress value={status.ready} max={status.total || 1} />
      )}
      {downloading && status?.waiting && (
        <p className="muted small">Google's per-minute limit reached. Continuing shortly…</p>
      )}
      {!online && !done && <p className="muted small">Connect to the internet to download the rest.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}

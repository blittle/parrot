import { useCallback, useEffect, useRef, useState } from "react";
import { downloadForOffline, offlineStatus, type OfflineStatus } from "../lib/offline";
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

  const download = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadForOffline(list, setStatus);
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setDownloading(false);
    }
  }, [list, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh, settings.voices]);

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
      {!online && !done && <p className="muted small">Connect to the internet to download the rest.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}

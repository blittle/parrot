import { useEffect, useState } from "react";
import { CheckIcon } from "../components/Icons";
import { Parrot } from "../components/Parrot";
import { listsDb } from "../lib/db";
import { languageLabel } from "../lib/languages";
import { offlineStatus, type OfflineStatus } from "../lib/offline";
import { href } from "../lib/router";
import type { WordList } from "../lib/types";

export function ListsPage() {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [offline, setOffline] = useState<Record<string, OfflineStatus>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listsDb.all().then(
      (all) => {
        setLists(all);
        for (const l of all) {
          offlineStatus(l).then(
            (s) => setOffline((o) => ({ ...o, [l.id]: s })),
            () => {},
          );
        }
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>Word lists</h1>
        <a className="button primary" href={href("import")}>
          Import
        </a>
      </div>
      {error && <p className="error">Could not open local storage: {error}</p>}
      {lists?.length === 0 && (
        <div className="empty">
          <Parrot mood="sleepy" size={120} />
          <p>
            <strong>No lists yet.</strong> Feed me some words!
          </p>
          <p className="muted">
            Import a spreadsheet (.xlsx or .csv) or paste words. A column of words and a column of translations is all you need; an article
            column (der/die/das) is optional.
          </p>
          <a className="button primary" href={href("import")}>
            Import your first list
          </a>
        </div>
      )}
      {lists && lists.length > 0 && (
        <ul className="cards">
          {lists.map((l) => {
            const known = l.words.filter((w) => w.known).length;
            const s = offline[l.id];
            const ready = s && s.total > 0 && s.ready === s.total;
            return (
              <li key={l.id}>
                <a href={href("lists", l.id)} className="card-link">
                  <strong>{l.name}</strong>
                  <span className="muted small">
                    {languageLabel(l.languageCode)} · {l.words.length} words{known ? ` · ${known} known` : ""}
                  </span>
                  {s && (
                    <span className={ready ? "badge ok" : "badge"}>
                      {ready ? (
                        <>
                          <CheckIcon size={12} /> Offline
                        </>
                      ) : (
                        `${Math.round((s.ready / Math.max(1, s.total)) * 100)}% downloaded`
                      )}
                    </span>
                  )}
                </a>
                <a className="button" href={href("practice", l.id)}>
                  Practice
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

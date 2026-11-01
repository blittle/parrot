import { useEffect, useState } from "react";
import { listsDb } from "../lib/db";
import { languageLabel } from "../lib/languages";
import { href } from "../lib/router";
import type { WordList } from "../lib/types";

export function ListsPage() {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listsDb.all().then(setLists, (e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>Word lists</h1>
        <a className="button primary" href={href("import")}>
          Import list
        </a>
      </div>
      {error && <p className="error">Could not open local storage: {error}</p>}
      {lists?.length === 0 && (
        <div className="empty">
          <p>No lists yet.</p>
          <p className="muted">
            Import a spreadsheet (.xlsx or .csv) or paste words from anywhere. A column of words and a column of
            translations is all you need; an article column (der/die/das) is optional.
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
            return (
              <li key={l.id}>
                <a href={href("lists", l.id)} className="card-link">
                  <strong>{l.name}</strong>
                  <span className="muted small">
                    {languageLabel(l.languageCode)} · {l.words.length} words{known ? ` · ${known} known` : ""}
                  </span>
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

import { splitArticle } from "../lib/text";
import type { Word } from "../lib/types";

/** A word with its article colour-coded by gender (der blue, die red, das green). */
export function Term({ word, languageCode }: { word: Word; languageCode: string }) {
  const { article, rest, gender } = splitArticle(word, languageCode);
  return (
    <span lang={languageCode}>
      {article && (
        <>
          <span className={`article g-${gender ?? "x"}`}>{article}</span>
          {article.endsWith("'") ? "" : " "}
        </>
      )}
      {rest}
    </span>
  );
}

const LEGENDS: Record<string, [string, string][]> = {
  de: [["der", "m"], ["die", "f"], ["das", "n"]],
  fr: [["le", "m"], ["la", "f"]],
  es: [["el", "m"], ["la", "f"]],
  it: [["il", "m"], ["la", "f"]],
};

export function GenderLegend({ languageCode }: { languageCode: string }) {
  const items = LEGENDS[languageCode.slice(0, 2)];
  if (!items) return null;
  return (
    <span className="legend" aria-label="Article colours">
      {items.map(([a, g]) => (
        <span key={a} className={`article g-${g}`}>
          {a}
        </span>
      ))}
    </span>
  );
}

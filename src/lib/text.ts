import type { Word } from "./types";

/** Articles per base language, used to detect article columns and avoid doubling. */
export const ARTICLES: Record<string, string[]> = {
  de: ["der", "die", "das"],
  fr: ["le", "la", "les", "l'", "un", "une"],
  es: ["el", "la", "los", "las"],
  it: ["il", "lo", "la", "i", "gli", "le", "l'"],
};

/** Single-letter gender markers mapped to the definite article. */
const GENDER_TO_ARTICLE: Record<string, Record<string, string>> = {
  de: { m: "der", f: "die", n: "das" },
  fr: { m: "le", f: "la" },
  es: { m: "el", f: "la" },
  it: { m: "il", f: "la" },
};

// Dictionary abbreviations that TTS would otherwise read letter by letter or skip.
const ABBREVIATIONS: Record<string, [RegExp, string][]> = {
  de: [
    [/\betw\./g, "etwas"],
    [/\bjdn\./g, "jemanden"],
    [/\bjdm\./g, "jemandem"],
    [/\bjds\./g, "jemandes"],
    [/\bjd\./g, "jemand"],
  ],
  en: [
    [/\bsth\./g, "something"],
    [/\bsb\./g, "somebody"],
    [/\bsmth\./g, "something"],
  ],
};

export function baseLanguage(code: string): string {
  return code.split("-")[0].toLowerCase();
}

/** Turns a gender marker like "m" into an article; passes real articles through. */
export function normalizeArticle(raw: string | undefined, languageCode: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const lang = baseLanguage(languageCode);
  const fromGender = GENDER_TO_ARTICLE[lang]?.[value.toLowerCase().replace(/\.$/, "")];
  return fromGender ?? value;
}

/**
 * Removes notation that belongs on screen but shouldn't be spoken:
 * parentheticals, brackets, plural endings like ", -e" or ", ¨-er", and "pl." notes.
 */
export function cleanForSpeech(text: string, languageCode: string): string {
  let s = text.normalize("NFC");
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
  // Plural/inflection suffixes after a comma: "Hund, -e", "Haus, ¨-er", "Auto, -s".
  s = s.replace(/,\s*(?:¨|")?-\S*\s*$/u, "");
  s = s.replace(/,?\s*\bpl\.\s.*$/i, "");
  for (const [pattern, replacement] of ABBREVIATIONS[baseLanguage(languageCode)] ?? []) {
    s = s.replace(pattern, replacement);
  }
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:/–-]+|[\s,;:/–-]+$/g, "")
    .trim();
}

function startsWithArticle(term: string, article: string): boolean {
  const t = term.toLowerCase();
  const a = article.toLowerCase();
  return a.endsWith("'") ? t.startsWith(a) : t === a || t.startsWith(`${a} `);
}

/** Text to speak for a word's term, including its article. */
export function spokenTerm(word: Word, languageCode: string): string {
  if (word.spoken?.trim()) return word.spoken.trim();
  const article = normalizeArticle(word.article, languageCode);
  const term = word.term.trim();
  const full =
    article && !startsWithArticle(term, article)
      ? article.endsWith("'")
        ? `${article}${term}`
        : `${article} ${term}`
      : term;
  return cleanForSpeech(full, languageCode);
}

export function spokenTranslation(word: Word, languageCode: string): string {
  return cleanForSpeech(word.translation, languageCode);
}

/** Display form: article + term, without cleaning. */
export function displayTerm(word: Word, languageCode: string): string {
  const article = normalizeArticle(word.article, languageCode);
  const term = word.term.trim();
  return article && !startsWithArticle(term, article) ? `${article} ${term}` : term;
}

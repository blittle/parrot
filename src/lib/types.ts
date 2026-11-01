export interface Word {
  id: string;
  /** The word or phrase in the language being learned, as written in the list. */
  term: string;
  translation: string;
  /** Article or gender marker, e.g. "der". Prepended to the term when spoken. */
  article?: string;
  notes?: string;
  /** Overrides the text sent to TTS for the term (e.g. to fix a pronunciation). */
  spoken?: string;
  known?: boolean;
}

export interface WordList {
  id: string;
  name: string;
  /** Language of the terms, e.g. "de-DE". */
  languageCode: string;
  /** Language of the translations, e.g. "en-US". */
  translationLanguageCode: string;
  words: Word[];
  createdAt: number;
  updatedAt: number;
}

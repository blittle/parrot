export interface Language {
  code: string;
  label: string;
}

export const TARGET_LANGUAGES: Language[] = [
  { code: "de-DE", label: "German" },
  { code: "fr-FR", label: "French" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "it-IT", label: "Italian" },
];

export const TRANSLATION_LANGUAGES: Language[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
];

export const ALL_LANGUAGES = [...TARGET_LANGUAGES, ...TRANSLATION_LANGUAGES];

export function languageLabel(code: string): string {
  return ALL_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

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

const GREETINGS: Record<string, [morning: string, day: string, evening: string]> = {
  de: ["Guten Morgen!", "Guten Tag!", "Guten Abend!"],
  fr: ["Bonjour !", "Bonjour !", "Bonsoir !"],
  es: ["¡Buenos días!", "¡Buenas tardes!", "¡Buenas noches!"],
  it: ["Buongiorno!", "Buongiorno!", "Buonasera!"],
  en: ["Good morning!", "Good afternoon!", "Good evening!"],
};

/** A time-of-day greeting in the language being learned. */
export function greeting(languageCode: string, hour: number): string {
  const set = GREETINGS[languageCode.slice(0, 2)] ?? GREETINGS.en;
  return hour < 12 ? set[0] : hour < 18 ? set[1] : set[2];
}

const PRAISE: Record<string, string> = {
  de: "Super gemacht!",
  fr: "Bravo !",
  es: "¡Muy bien!",
  it: "Bravissimo!",
  en: "Nicely done!",
};

/** "Well done" in the language being learned. */
export function praise(languageCode: string): string {
  return PRAISE[languageCode.slice(0, 2)] ?? PRAISE.en;
}

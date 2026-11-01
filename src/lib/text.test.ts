import { describe, expect, it } from "vitest";
import { cleanForSpeech, displayTerm, normalizeArticle, spokenTerm, spokenTranslation } from "./text";

const w = (term: string, extra: Partial<{ article: string; spoken: string; translation: string }> = {}) => ({
  id: "1",
  term,
  translation: extra.translation ?? "",
  ...extra,
});

describe("cleanForSpeech", () => {
  it("strips notation that shouldn't be spoken", () => {
    expect(cleanForSpeech("das Eichhörnchen (n.)", "de-DE")).toBe("das Eichhörnchen");
    expect(cleanForSpeech("die Straße, -n", "de-DE")).toBe("die Straße");
    expect(cleanForSpeech("das Haus, ¨-er", "de-DE")).toBe("das Haus");
    expect(cleanForSpeech("der Apfel [fruit]", "de-DE")).toBe("der Apfel");
    expect(cleanForSpeech("die Frau, pl. Frauen", "de-DE")).toBe("die Frau");
  });

  it("expands dictionary abbreviations", () => {
    expect(cleanForSpeech("etw. kaufen", "de-DE")).toBe("etwas kaufen");
    expect(cleanForSpeech("jdm. helfen", "de-DE")).toBe("jemandem helfen");
    expect(cleanForSpeech("to buy sth.", "en-US")).toBe("to buy something");
  });

  it("keeps ordinary punctuation inside phrases", () => {
    expect(cleanForSpeech("Ich hätte gern zwei Brötchen, bitte.", "de-DE")).toBe("Ich hätte gern zwei Brötchen, bitte.");
  });
});

describe("articles", () => {
  it("maps gender markers to articles", () => {
    expect(normalizeArticle("m", "de-DE")).toBe("der");
    expect(normalizeArticle("f.", "de-DE")).toBe("die");
    expect(normalizeArticle("n", "de-DE")).toBe("das");
    expect(normalizeArticle("f", "fr-FR")).toBe("la");
    expect(normalizeArticle("die", "de-DE")).toBe("die");
    expect(normalizeArticle(" ", "de-DE")).toBeUndefined();
  });

  it("prepends the article once", () => {
    expect(spokenTerm(w("Hund", { article: "der" }), "de-DE")).toBe("der Hund");
    expect(spokenTerm(w("der Hund", { article: "der" }), "de-DE")).toBe("der Hund");
    expect(spokenTerm(w("Katze", { article: "f" }), "de-DE")).toBe("die Katze");
    expect(spokenTerm(w("école", { article: "l'" }), "fr-FR")).toBe("l'école");
    expect(displayTerm(w("Hund", { article: "m" }), "de-DE")).toBe("der Hund");
  });

  it("uses the spoken override verbatim", () => {
    expect(spokenTerm(w("Hund", { article: "der", spoken: "der Hunt" }), "de-DE")).toBe("der Hunt");
  });

  it("cleans translations in their own language", () => {
    expect(spokenTranslation(w("x", { translation: "to help sb. (with)" }), "en-US")).toBe("to help somebody");
  });
});

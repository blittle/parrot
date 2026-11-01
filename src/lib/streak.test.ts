import { describe, expect, it } from "vitest";
import { greeting } from "./languages";
import { currentStreak, recordSession } from "./streak";
import { splitArticle } from "./text";

describe("streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    const days = ["2026-10-28", "2026-10-30", "2026-10-31", "2026-11-01"];
    expect(currentStreak(days, "2026-11-01")).toBe(3);
    expect(currentStreak(days, "2026-11-02")).toBe(3); // today not done yet
    expect(currentStreak(days, "2026-11-03")).toBe(0);
    expect(currentStreak([], "2026-11-01")).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    expect(currentStreak(["2025-12-31", "2026-01-01"], "2026-01-01")).toBe(2);
    expect(currentStreak(["2026-02-28", "2026-03-01"], "2026-03-01")).toBe(2);
  });

  it("records a day once and adds words", () => {
    let data = recordSession({ days: [], totalWords: 0 }, "2026-11-01", 10);
    data = recordSession(data, "2026-11-01", 5);
    expect(data).toEqual({ days: ["2026-11-01"], totalWords: 15 });
  });
});

describe("splitArticle", () => {
  const w = (term: string, article?: string) => ({ id: "1", term, translation: "", article });
  it("finds the article and its gender", () => {
    expect(splitArticle(w("Hund", "der"), "de-DE")).toEqual({ article: "der", rest: "Hund", gender: "m" });
    expect(splitArticle(w("die Katze"), "de-DE")).toEqual({ article: "die", rest: "Katze", gender: "f" });
    expect(splitArticle(w("Haus", "n"), "de-DE")).toEqual({ article: "das", rest: "Haus", gender: "n" });
    expect(splitArticle(w("la maison"), "fr-FR")).toEqual({ article: "la", rest: "maison", gender: "f" });
  });

  it("leaves words without an article alone", () => {
    expect(splitArticle(w("Entschuldigung"), "de-DE")).toEqual({ rest: "Entschuldigung" });
    expect(splitArticle(w("die"), "de-DE")).toEqual({ rest: "die" });
    expect(splitArticle(w("Ich hätte gern"), "de-DE")).toEqual({ rest: "Ich hätte gern" });
  });

  it("splits elided articles without a gender", () => {
    expect(splitArticle(w("école", "l'"), "fr-FR")).toEqual({ article: "l'", rest: "école" });
  });
});

describe("greeting", () => {
  it("greets by time of day in the target language", () => {
    expect(greeting("de-DE", 8)).toBe("Guten Morgen!");
    expect(greeting("de-DE", 14)).toBe("Guten Tag!");
    expect(greeting("es-MX", 21)).toBe("¡Buenas noches!");
    expect(greeting("xx-XX", 9)).toBe("Good morning!");
  });
});

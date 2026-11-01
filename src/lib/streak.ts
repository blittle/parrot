// A daily practice streak, kept on this device.

const STREAK_KEY = "parrot:streak";

export interface StreakData {
  /** Local dates (YYYY-MM-DD) with a finished session, oldest first. */
  days: string[];
  /** Words heard across finished sessions, all time. */
  totalWords: number;
}

const EMPTY: StreakData = { days: [], totalWords: 0 };

/** Today's local date as YYYY-MM-DD. */
export function localDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return localDate(d);
}

/** Consecutive practice days ending today, or yesterday if today isn't done yet. */
export function currentStreak(days: string[], today: string): number {
  const set = new Set(days);
  let day = set.has(today) ? today : previousDay(today);
  let count = 0;
  while (set.has(day)) {
    count++;
    day = previousDay(day);
  }
  return count;
}

export function recordSession(data: StreakData, today: string, words: number): StreakData {
  const days = data.days.includes(today) ? data.days : [...data.days, today].slice(-400);
  return { days, totalWords: data.totalWords + words };
}

export function loadStreak(): StreakData {
  try {
    const saved = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "null") as StreakData | null;
    return saved?.days ? saved : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveStreak(data: StreakData): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch {
    // The streak just won't persist.
  }
}

import { useSyncExternalStore } from "react";

export interface Settings {
  /** User's own Google Cloud API key. Empty means use the Parrot server. */
  apiKey: string;
  /** Keep the key across browser restarts (localStorage) or only this tab (sessionStorage). */
  rememberKey: boolean;
  /** Default voice per language code. */
  voices: Record<string, string>;
}

const SETTINGS_KEY = "parrot:settings";
const API_KEY = "parrot:api-key";

const DEFAULTS: Settings = { apiKey: "", rememberKey: true, voices: {} };

function read(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage blocked (private mode); settings only last for this page load.
  }
}

function load(): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(read(globalThis.localStorage, SETTINGS_KEY) ?? "{}") as Partial<Settings>;
  } catch {
    stored = {};
  }
  const apiKey = read(globalThis.localStorage, API_KEY) ?? read(globalThis.sessionStorage, API_KEY) ?? "";
  return { ...DEFAULTS, ...stored, apiKey };
}

let current: Settings = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  const { apiKey, ...rest } = current;
  write(globalThis.localStorage, SETTINGS_KEY, JSON.stringify(rest));
  // The key is stored separately so "remember" can switch which storage holds it.
  write(globalThis.localStorage, API_KEY, current.rememberKey && apiKey ? apiKey : null);
  write(globalThis.sessionStorage, API_KEY, !current.rememberKey && apiKey ? apiKey : null);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

import { useEffect, useState, useSyncExternalStore } from "react";

let updateReady = false;
const updateListeners = new Set<() => void>();

/** Registers the service worker in production and notices when a new version takes over. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The first install also fires this; only a replacement is an update.
    if (!hadController) return;
    updateReady = true;
    updateListeners.forEach((l) => l());
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => console.warn("Service worker failed", err));
  });
}

/** True once a new version of the app is installed; reloading picks it up. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      updateListeners.add(l);
      return () => updateListeners.delete(l);
    },
    () => updateReady,
  );
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("online", l);
      window.addEventListener("offline", l);
      return () => {
        window.removeEventListener("online", l);
        window.removeEventListener("offline", l);
      };
    },
    () => navigator.onLine,
  );
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as InstallPromptEvent;
  promptListeners.forEach((l) => l());
});

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Chrome/Android's install prompt, when the browser offers one. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [available, setAvailable] = useState(!!deferredPrompt);
  useEffect(() => {
    const l = () => setAvailable(!!deferredPrompt);
    promptListeners.add(l);
    return () => void promptListeners.delete(l);
  }, []);
  if (!available || !deferredPrompt) return null;
  return async () => {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    setAvailable(false);
    await prompt?.prompt();
  };
}

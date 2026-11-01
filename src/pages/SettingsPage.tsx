import { useEffect, useState } from "react";
import { clipsDb } from "../lib/db";
import { isIos, isStandalone, useInstallPrompt } from "../lib/pwa";
import { updateSettings, useSettings } from "../lib/settings";
import { listVoices } from "../lib/tts";

export function SettingsPage({ serverOk }: { serverOk: boolean | null }) {
  const settings = useSettings();
  const [draft, setDraft] = useState(settings.apiKey);
  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [clipCount, setClipCount] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usageMb, setUsageMb] = useState<number | null>(null);
  const install = useInstallPrompt();
  const standalone = isStandalone();

  useEffect(() => {
    clipsDb.count().then(setClipCount, () => setClipCount(null));
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsageMb(e.usage ? e.usage / 1024 / 1024 : 0), () => setUsageMb(null));
  }, []);

  async function save() {
    updateSettings({ apiKey: draft.trim() });
    setTest(null);
    if (!draft.trim()) return;
    try {
      const voices = await listVoices("de-DE");
      setTest({ ok: true, message: `Key works. ${voices.length} German voices available.` });
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    }
  }

  function remove() {
    setDraft("");
    setTest(null);
    updateSettings({ apiKey: "" });
  }

  async function clearCache() {
    if (!confirm("Delete all saved audio on this device? It will be downloaded again when needed.")) return;
    await clipsDb.clear();
    setClipCount(0);
  }

  const mode = settings.apiKey ? "Your own Google API key, called directly from this browser" : serverOk ? "The Parrot server" : "Not set up";

  return (
    <>
      <h1>Settings</h1>

      <section className="panel">
        <h2>Install the app</h2>
        {standalone ? (
          <p>Parrot is installed. It opens from your home screen and works offline.</p>
        ) : install ? (
          <>
            <p>Install Parrot to open it from your home screen, full screen and offline.</p>
            <button className="button primary" onClick={() => void install()}>
              Install Parrot
            </button>
          </>
        ) : isIos() ? (
          <ol className="help">
            <li>
              Tap the <strong>Share</strong> button in Safari's toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
            <li>Open Parrot from the new home screen icon. It works offline from then on.</li>
            <li>
              Import your lists <strong>in the installed app</strong>. On iPhone, the home screen app keeps its own storage, so lists saved in
              Safari don't carry over.
            </li>
          </ol>
        ) : (
          <p>
            In your browser's menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Text to speech</h2>
        <p>
          Audio source: <strong>{mode}</strong>
        </p>

        <label className="field">
          <span>Google Cloud API key</span>
          <div className="input-row">
            <input
              type={reveal ? "text" : "password"}
              autoCapitalize="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="button" onClick={() => setReveal(!reveal)}>
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.rememberKey} onChange={(e) => updateSettings({ rememberKey: e.target.checked })} />
          Remember on this device (otherwise it's forgotten when you close the tab)
        </label>
        <div className="row-actions">
          <button className="button primary" onClick={() => void save()} disabled={!draft.trim()}>
            Save and test
          </button>
          {settings.apiKey && (
            <button className="button" onClick={remove}>
              Remove key
            </button>
          )}
        </div>
        {test && <p className={test.ok ? "success" : "error"}>{test.message}</p>}

        <details>
          <summary>How to get a key, and keep it safe</summary>
          <ol className="help">
            <li>
              In the <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud console</a>, create a project and
              attach a billing account.
            </li>
            <li>
              Under <strong>APIs &amp; Services → Library</strong>, enable <strong>Cloud Text-to-Speech API</strong>.
            </li>
            <li>
              Under <strong>APIs &amp; Services → Credentials</strong>, create an <strong>API key</strong>.
            </li>
            <li>
              Edit the key and restrict it:
              <ul>
                <li>
                  <strong>API restrictions:</strong> only Cloud Text-to-Speech API.
                </li>
                <li>
                  <strong>Website restrictions:</strong> add <code>{location.origin}/*</code>, so the key only works from this site.
                </li>
              </ul>
            </li>
            <li>Optionally set a budget alert under Billing.</li>
          </ol>
          <p className="muted small">
            The key is stored only in this browser and sent only to Google (texttospeech.googleapis.com). Audio is cached on this device, so
            each word is only paid for once.
          </p>
        </details>
      </section>

      <section className="panel">
        <h2>Saved audio</h2>
        <p>
          {clipCount === null ? "Unknown" : `${clipCount} clips`} saved on this device
          {usageMb !== null ? ` (${usageMb < 1 ? "<1" : Math.round(usageMb)} MB used)` : ""}.
          {persisted === false && <span className="muted"> The browser may clear them if storage runs low or the site isn't used for a while.</span>}
        </p>
        <button className="button" onClick={() => void clearCache()} disabled={!clipCount}>
          Clear saved audio
        </button>
      </section>
    </>
  );
}

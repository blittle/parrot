import { useEffect, useState } from "react";
import { ListsIcon, PracticeIcon, SettingsIcon, VoicesIcon } from "./components/Icons";
import { useOnline, useUpdateReady } from "./lib/pwa";
import { href, useRoute } from "./lib/router";
import { useSettings } from "./lib/settings";
import { ImportPage } from "./pages/ImportPage";
import { ListPage } from "./pages/ListPage";
import { ListsPage } from "./pages/ListsPage";
import { PracticePage } from "./pages/PracticePage";
import { SettingsPage } from "./pages/SettingsPage";
import { VoicesPage } from "./pages/VoicesPage";

const NAV = [
  { id: "practice", label: "Practice", Icon: PracticeIcon },
  { id: "lists", label: "Lists", Icon: ListsIcon },
  { id: "voices", label: "Voices", Icon: VoicesIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export function App() {
  const route = useRoute();
  const [section = "practice", id] = route;
  const settings = useSettings();
  const online = useOnline();
  const updateReady = useUpdateReady();
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  // When there's no key of their own, check whether the Parrot server is usable, to guide setup.
  const hasKey = !!settings.apiKey;
  useEffect(() => {
    if (hasKey || !online) return;
    fetch("/api/voices?lang=de-DE")
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
  }, [hasKey, online]);

  // New page, start at the top (mobile browsers keep the old scroll position).
  // Braces matter: newer Chrome returns a Promise from scrollTo, which React would treat as a cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section, id]);

  const needsKey = !settings.apiKey && serverOk === false;
  const active = section === "import" ? "lists" : section;

  let page;
  if (section === "lists" && id) page = <ListPage id={id} />;
  else if (section === "lists") page = <ListsPage />;
  else if (section === "import") page = <ImportPage />;
  else if (section === "voices") page = <VoicesPage />;
  else if (section === "settings") page = <SettingsPage serverOk={serverOk} />;
  else page = <PracticePage listId={id} />;

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        <a className="brand" href={href("practice")}>
          Parrot
        </a>
        {NAV.map(({ id: navId, label, Icon }) => (
          <a key={navId} href={href(navId)} className={active === navId ? "active" : ""} aria-current={active === navId ? "page" : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <main>
        {!online && <div className="notice">You're offline. Downloaded lists still play.</div>}
        {updateReady && (
          <button className="notice notice-button" onClick={() => location.reload()}>
            A new version of Parrot is ready. Tap to update.
          </button>
        )}
        {needsKey && online && section !== "settings" && (
          <div className="notice">
            To hear audio, add your Google Cloud API key in <a href={href("settings")}>Settings</a>.
          </div>
        )}
        {page}
      </main>
    </>
  );
}

import { useEffect, useState } from "react";
import { href, useRoute } from "./lib/router";
import { useSettings } from "./lib/settings";
import { ImportPage } from "./pages/ImportPage";
import { ListPage } from "./pages/ListPage";
import { ListsPage } from "./pages/ListsPage";
import { PracticePage } from "./pages/PracticePage";
import { SettingsPage } from "./pages/SettingsPage";
import { VoicesPage } from "./pages/VoicesPage";

const NAV = [
  { id: "lists", label: "Lists" },
  { id: "practice", label: "Practice" },
  { id: "voices", label: "Voices" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const route = useRoute();
  const [section = "lists", id] = route;
  const settings = useSettings();
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  // When there's no key of their own, check whether the Parrot server is usable, to guide setup.
  const hasKey = !!settings.apiKey;
  useEffect(() => {
    if (hasKey) return;
    fetch("/api/voices?lang=de-DE")
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
  }, [hasKey]);

  const needsKey = !settings.apiKey && serverOk === false;

  let page;
  if (section === "lists" && id) page = <ListPage id={id} />;
  else if (section === "import") page = <ImportPage />;
  else if (section === "practice") page = <PracticePage listId={id} />;
  else if (section === "voices") page = <VoicesPage />;
  else if (section === "settings") page = <SettingsPage serverOk={serverOk} />;
  else page = <ListsPage />;

  return (
    <>
      <nav className="topnav">
        <a className="brand" href={href("lists")}>
          Parrot
        </a>
        {NAV.map((n) => (
          <a key={n.id} href={href(n.id)} className={section === n.id || (n.id === "lists" && section === "import") ? "active" : ""}>
            {n.label}
          </a>
        ))}
      </nav>
      <main>
        {needsKey && section !== "settings" && (
          <div className="notice">
            To hear audio, add your Google Cloud API key in <a href={href("settings")}>Settings</a>.
          </div>
        )}
        {page}
      </main>
    </>
  );
}

import { useEffect, useState } from "react";

/** Tiny hash router: "#/lists/abc" becomes ["lists", "abc"]. */
export function useRoute(): string[] {
  const parse = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(...parts: string[]): void {
  location.hash = `/${parts.map(encodeURIComponent).join("/")}`;
}

export function href(...parts: string[]): string {
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}

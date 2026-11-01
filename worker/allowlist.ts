/** Parses "a@x.com, B@y.com" into a set of lowercase emails. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isAllowed(email: unknown, allowlist: Set<string>): boolean {
  return typeof email === "string" && allowlist.has(email.trim().toLowerCase());
}

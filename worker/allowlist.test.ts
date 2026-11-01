import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "./allowlist";

describe("allowlist", () => {
  it("parses comma or whitespace separated emails, case-insensitively", () => {
    const list = parseAllowlist(" Alice@Example.com, bob@example.org\ncarol@example.net ,, junk ");
    expect([...list]).toEqual(["alice@example.com", "bob@example.org", "carol@example.net"]);
    expect(isAllowed("ALICE@example.com", list)).toBe(true);
    expect(isAllowed("mallory@example.com", list)).toBe(false);
  });

  it("rejects missing or non-string emails and empty lists", () => {
    expect(isAllowed(undefined, parseAllowlist("a@b.c"))).toBe(false);
    expect(isAllowed(42, parseAllowlist("a@b.c"))).toBe(false);
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(isAllowed("a@b.c", parseAllowlist(""))).toBe(false);
  });
});

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkAccess } from "./auth";

const TEAM = "parrot-test.cloudflareaccess.com";
const AUD = "test-aud";
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAILS: "me@example.com, Friend@example.com" };

let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  // Stand in for Cloudflare's certs endpoint.
  vi.stubGlobal("fetch", async (url: string | URL) => {
    expect(String(url)).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  });
});

afterAll(() => vi.unstubAllGlobals());

function token(claims: Record<string, unknown>, opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

const req = (jwt?: string) => new Request("https://parrot.test/api/voices", { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} });

describe("checkAccess", () => {
  it("allows a valid token for an allowlisted email, case-insensitively", async () => {
    expect(await checkAccess(req(await token({ email: "me@example.com" })), env)).toBeNull();
    expect(await checkAccess(req(await token({ email: "friend@EXAMPLE.com" })), env)).toBeNull();
  });

  it("rejects a valid token for an email not on the list", async () => {
    expect(await checkAccess(req(await token({ email: "stranger@example.com" })), env)).toBe("This account is not allowed");
    expect(await checkAccess(req(await token({})), env)).toBe("This account is not allowed");
  });

  it("rejects bad tokens", async () => {
    const bad = "Invalid Cloudflare Access token";
    expect(await checkAccess(req(), env)).toBe("Missing Cloudflare Access token");
    expect(await checkAccess(req("not-a-jwt"), env)).toBe(bad);
    expect(await checkAccess(req(await token({ email: "me@example.com" }, { key: otherKey })), env)).toBe(bad);
    expect(await checkAccess(req(await token({ email: "me@example.com" }, { aud: "other-app" })), env)).toBe(bad);
    expect(await checkAccess(req(await token({ email: "me@example.com" }, { iss: "https://evil.example" })), env)).toBe(bad);
    expect(await checkAccess(req(await token({ email: "me@example.com" }, { exp: "-1m" })), env)).toBe(bad);
  });

  it("fails closed when not configured", async () => {
    const jwt = await token({ email: "me@example.com" });
    expect(await checkAccess(req(jwt), { ...env, ACCESS_AUD: "" })).toBe("Cloudflare Access is not configured");
    expect(await checkAccess(req(jwt), { ...env, ALLOWED_EMAILS: "" })).toBe("No allowed emails are configured");
    expect(await checkAccess(req(jwt), { ...env, ALLOWED_EMAILS: undefined })).toBe("No allowed emails are configured");
  });

  it("can be disabled for local development", async () => {
    expect(await checkAccess(req(), { AUTH_DISABLED: "true" })).toBeNull();
  });
});

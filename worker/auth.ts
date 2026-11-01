import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  AUTH_DISABLED?: string;
}

// Cached per isolate so we don't refetch Cloudflare's signing keys on every request.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksDomain: string | undefined;

/**
 * Verifies the Cloudflare Access JWT on the request. Access already blocks
 * unauthenticated traffic at the edge; this is defense in depth in case the
 * Worker is reached another way (e.g. a workers.dev URL left enabled).
 *
 * Fails closed: if Access isn't configured, every request is rejected.
 */
export async function checkAccess(request: Request, env: AuthEnv): Promise<string | null> {
  if (env.AUTH_DISABLED === "true") return null;

  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return "Cloudflare Access is not configured";

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return "Missing Cloudflare Access token";

  const issuer = `https://${team.replace(/^https?:\/\//, "")}`;
  if (!jwks || jwksDomain !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksDomain = issuer;
  }

  try {
    await jwtVerify(token, jwks, { issuer, audience: aud });
    return null;
  } catch {
    return "Invalid Cloudflare Access token";
  }
}

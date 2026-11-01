import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAllowed, parseAllowlist } from "./allowlist";

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Comma-separated emails allowed to use the API. Set with `wrangler secret put`. */
  ALLOWED_EMAILS?: string;
  AUTH_DISABLED?: string;
}

// Cached per isolate so we don't refetch Cloudflare's signing keys on every request.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksDomain: string | undefined;

/**
 * Verifies the Cloudflare Access JWT on the request and checks the signed-in
 * email against ALLOWED_EMAILS. Access already blocks unauthenticated traffic
 * at the edge; this is defense in depth in case the Worker is reached another
 * way (e.g. a workers.dev URL left enabled) or the Access policy is too broad.
 *
 * Fails closed: if Access or the allowlist isn't configured, every request is rejected.
 */
export async function checkAccess(request: Request, env: AuthEnv): Promise<string | null> {
  if (env.AUTH_DISABLED === "true") return null;

  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return "Cloudflare Access is not configured";

  const allowlist = parseAllowlist(env.ALLOWED_EMAILS);
  if (allowlist.size === 0) return "No allowed emails are configured";

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return "Missing Cloudflare Access token";

  const issuer = `https://${team.replace(/^https?:\/\//, "")}`;
  if (!jwks || jwksDomain !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksDomain = issuer;
  }

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
    email = payload.email;
  } catch {
    return "Invalid Cloudflare Access token";
  }

  return isAllowed(email, allowlist) ? null : "This account is not allowed";
}

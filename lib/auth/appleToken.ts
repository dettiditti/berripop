import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/**
 * Checks an identity token from Sign in with Apple on the iPhone (the app's
 * own Apple sheet). Only a token that Apple signed, for this app, recently,
 * with an email Apple vouches for is accepted. Pure: the caller passes
 * Apple's public keys and the clock, so every rule is unit-tested.
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
/** Apple's tokens live ten minutes; one older than this is refused even if not expired. */
export const APPLE_MAX_AGE_S = 10 * 60;
const SKEW_S = 60;

export type AppleKey = JsonWebKey & { kid?: string; alg?: string; kty?: string };
export type AppleIdentity = { sub: string; email: string };
export type AppleTokenError =
  | "malformed" | "bad_alg" | "unknown_key" | "bad_signature" | "bad_issuer"
  | "bad_audience" | "expired" | "too_old" | "no_subject" | "no_email" | "email_unverified";

export class AppleTokenRejected extends Error {
  constructor(public code: AppleTokenError) { super(code); }
}

function part(s: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // Falls through to malformed.
  }
  throw new AppleTokenRejected("malformed");
}

/** The kid in the token's header (to pick or refresh Apple's key), or null. */
export function appleTokenKid(token: string): string | null {
  try {
    const kid = part(token.split(".")[0] ?? "").kid;
    return typeof kid === "string" ? kid : null;
  } catch {
    return null;
  }
}

/**
 * The member's Apple identity (the stable Apple user id and the verified
 * email), or throws AppleTokenRejected with the reason.
 */
export function verifyAppleIdToken(token: unknown, opts: { audience: string; keys: AppleKey[]; now: Date }): AppleIdentity {
  if (typeof token !== "string" || token.length > 8000) throw new AppleTokenRejected("malformed");
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some(s => !/^[A-Za-z0-9_-]+$/.test(s))) throw new AppleTokenRejected("malformed");
  const [h, p, sig] = segments;
  const header = part(h);
  const claims = part(p);

  if (header.alg !== "RS256") throw new AppleTokenRejected("bad_alg");
  const key = opts.keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!key) throw new AppleTokenRejected("unknown_key");
  let ok = false;
  try {
    const pub = createPublicKey({ key, format: "jwk" });
    ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), pub, Buffer.from(sig, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) throw new AppleTokenRejected("bad_signature");

  if (claims.iss !== APPLE_ISSUER) throw new AppleTokenRejected("bad_issuer");
  const aud = claims.aud;
  if (!(aud === opts.audience || (Array.isArray(aud) && aud.length === 1 && aud[0] === opts.audience))) throw new AppleTokenRejected("bad_audience");
  const now = Math.floor(opts.now.getTime() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < now) throw new AppleTokenRejected("expired");
  if (typeof claims.iat !== "number" || claims.iat > now + SKEW_S || now - claims.iat > APPLE_MAX_AGE_S) throw new AppleTokenRejected("too_old");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new AppleTokenRejected("no_subject");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppleTokenRejected("no_email");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new AppleTokenRejected("email_unverified");
  return { sub: claims.sub, email };
}

import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { appleTokenKid, AppleTokenRejected, APPLE_ISSUER, GOOGLE_ISSUERS, verifyIdToken, type AppleKey } from "../auth/appleToken";

/*
 * Sign in with Apple and with Google inside the iPhone app. The app's own
 * sign-in sheets return an identity token for the app; Clerk's web API does
 * not take such a token from the page (authorization_invalid), so the server
 * checks it here and hands back a one-time Clerk sign-in ticket that the page
 * redeems.
 *
 * - The token must be signed by the provider, for one of our app's client
 *   ids, at most ten minutes old, with an email the provider marks as
 *   verified (lib/auth/appleToken).
 * - An account with that email is signed in only if Clerk also has the email
 *   verified; otherwise a new account is created with it.
 * - The ticket is valid for two minutes and can be used once.
 * Nothing about the token or the member is logged.
 */

export type NativeProvider = "apple" | "google";

const PROVIDERS: Record<NativeProvider, { keysUrl: string; issuers: string[]; audiences: () => string[] }> = {
  apple: {
    keysUrl: "https://appleid.apple.com/auth/keys",
    issuers: [APPLE_ISSUER],
    audiences: () => [process.env.APNS_BUNDLE_ID || "com.berripop.app"],
  },
  google: {
    keysUrl: "https://www.googleapis.com/oauth2/v3/certs",
    issuers: GOOGLE_ISSUERS,
    // The app asks Google for a token for the web client (Clerk's); the iOS client is the one that signed in.
    audiences: () => [process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID].filter((v): v is string => !!v),
  },
};
const TICKET_SECONDS = 120;

const cache = new Map<NativeProvider, { keys: AppleKey[]; at: number }>();

async function providerKeys(provider: NativeProvider, fresh: boolean): Promise<AppleKey[]> {
  const hit = cache.get(provider);
  if (!fresh && hit && Date.now() - hit.at < 3600_000) return hit.keys;
  const res = await fetch(PROVIDERS[provider].keysUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("keys");
  const body = (await res.json()) as { keys?: AppleKey[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cache.set(provider, { keys, at: Date.now() });
  return keys;
}

function cleanName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  return s || undefined;
}

export type NativeSignInResult = { ok: true; ticket: string } | { ok: false; code: string };

export async function nativeSignIn(provider: NativeProvider, idToken: unknown, firstName?: unknown, lastName?: unknown): Promise<NativeSignInResult> {
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, code: "bad_provider" };
  const audiences = p.audiences();
  if (!audiences.length) return { ok: false, code: "not_configured" };
  let identity;
  try {
    let keys = await providerKeys(provider, false);
    // Providers rotate their keys: an unknown key id fetches the list again once.
    const kid = typeof idToken === "string" ? appleTokenKid(idToken) : null;
    if (kid && !keys.some(k => k.kid === kid)) keys = await providerKeys(provider, true);
    identity = verifyIdToken(idToken, { issuers: p.issuers, audiences, keys, now: new Date() });
  } catch (err) {
    return { ok: false, code: err instanceof AppleTokenRejected ? err.code : "provider_unavailable" };
  }

  try {
    const clerk = await clerkClient();
    const found = await clerk.users.getUserList({ emailAddress: [identity.email], limit: 2 });
    let userId: string;
    if (found.data.length > 1) return { ok: false, code: "ambiguous_account" };
    if (found.data.length === 1) {
      const user = found.data[0];
      const address = user.emailAddresses.find(e => e.emailAddress.toLowerCase() === identity.email);
      if (address?.verification?.status !== "verified") return { ok: false, code: "email_unverified" };
      userId = user.id;
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [identity.email],
        firstName: cleanName(firstName),
        lastName: cleanName(lastName),
        skipPasswordRequirement: true,
        privateMetadata: provider === "apple" ? { appleSub: identity.sub } : { googleSub: identity.sub },
      });
      userId = created.id;
    }
    const ticket = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: TICKET_SECONDS });
    return { ok: true, ticket: ticket.token };
  } catch {
    return { ok: false, code: "account_failed" };
  }
}

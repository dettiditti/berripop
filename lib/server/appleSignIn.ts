import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { appleTokenKid, AppleTokenRejected, verifyAppleIdToken, type AppleKey } from "../auth/appleToken";

/*
 * Sign in with Apple inside the iPhone app. The app's own Apple sheet returns
 * an identity token for the app (com.berripop.app); Clerk's web API does not
 * take such a token from the page, so the server checks it here and hands
 * back a one-time Clerk sign-in ticket that the page redeems.
 *
 * - The token must be signed by Apple, for this app, at most ten minutes old,
 *   with an email Apple marks as verified (lib/auth/appleToken).
 * - An account with that email is signed in only if Clerk also has the email
 *   verified; otherwise a new account is created with it.
 * - The ticket is valid for two minutes and can be used once.
 * Nothing about the token or the member is logged.
 */

const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
export const APPLE_APP_ID = process.env.APNS_BUNDLE_ID || "com.berripop.app";
const TICKET_SECONDS = 120;

let cached: { keys: AppleKey[]; at: number } | null = null;

async function appleKeys(fresh: boolean): Promise<AppleKey[]> {
  if (!fresh && cached && Date.now() - cached.at < 3600_000) return cached.keys;
  const res = await fetch(APPLE_KEYS_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("apple_keys");
  const body = (await res.json()) as { keys?: AppleKey[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cached = { keys, at: Date.now() };
  return keys;
}

function cleanName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  return s || undefined;
}

export type AppleSignInResult = { ok: true; ticket: string } | { ok: false; code: string };

export async function appleSignIn(idToken: unknown, firstName?: unknown, lastName?: unknown): Promise<AppleSignInResult> {
  let identity;
  try {
    let keys = await appleKeys(false);
    // Apple rotates its keys: an unknown key id fetches the list again once.
    const kid = typeof idToken === "string" ? appleTokenKid(idToken) : null;
    if (kid && !keys.some(k => k.kid === kid)) keys = await appleKeys(true);
    identity = verifyAppleIdToken(idToken, { audience: APPLE_APP_ID, keys, now: new Date() });
  } catch (err) {
    return { ok: false, code: err instanceof AppleTokenRejected ? err.code : "apple_unavailable" };
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
        privateMetadata: { appleSub: identity.sub },
      });
      userId = created.id;
    }
    const ticket = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: TICKET_SECONDS });
    return { ok: true, ticket: ticket.token };
  } catch {
    return { ok: false, code: "account_failed" };
  }
}

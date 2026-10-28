import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { ensureUserRow } from "./session";

/*
 * Authentication for the mobile API (/api/v1). Only a Clerk session token in
 * the Authorization header counts: Clerk verifies it (signature, expiry,
 * token type) with authenticateRequest(). Cookies are never forwarded, so a
 * browser session cannot drive the API (no CSRF), and the user id always
 * comes from the verified token, never from the request.
 */

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

/** Clerk could not be reached or is misconfigured: a server problem, not a bad token. */
export class AuthUnavailableError extends Error {}

/** The Clerk user id behind a valid session token in the Authorization header, or null. */
export async function bearerUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization")?.trim();
  const token = header?.match(BEARER)?.[1];
  if (!token) return null;
  let state;
  try {
    const client = await clerkClient();
    // A copy carrying only the token: no cookies, so only the header can authenticate.
    const headerOnly = new Request(req.url, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    state = await client.authenticateRequest(headerOnly, { acceptsToken: "session_token" });
  } catch {
    throw new AuthUnavailableError();
  }
  if (!state.isAuthenticated) return null;
  const { userId } = state.toAuth();
  return typeof userId === "string" && userId ? userId : null;
}

/** Clerk has no such user: the login was deleted, though its token may not have expired yet. */
class LoginGone extends Error {}

/**
 * Like bearerUserId, and also creates our user row on the member's first
 * mobile request (as the web does on first visit). For endpoints that write.
 * The name comes from Clerk's user record; if that lookup fails the row is
 * still created, without a name. A login Clerk no longer has (deleted, with
 * a token still in its short lifetime) gets null, so a deleted account is
 * never recreated empty.
 */
export async function bearerMember(req: Request): Promise<string | null> {
  const userId = await bearerUserId(req);
  if (!userId) return null;
  try {
    await ensureUserRow(userId, async () => {
      let u;
      try {
        u = await (await clerkClient()).users.getUser(userId);
      } catch (e) {
        if ((e as { status?: unknown })?.status === 404) throw new LoginGone();
        return "";
      }
      return u.firstName || u.username || "";
    });
  } catch (e) {
    if (e instanceof LoginGone) return null;
    throw e;
  }
  return userId;
}

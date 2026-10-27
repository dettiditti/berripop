import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

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

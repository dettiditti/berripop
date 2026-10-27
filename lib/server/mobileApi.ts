import "server-only";
import { AuthUnavailableError, bearerMember, bearerUserId } from "./mobileAuth";

/*
 * Shared plumbing for /api/v1 route handlers: every response is private and
 * never cached, and errors carry only a short code, never internal details.
 */

export const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Authorization" };

export const apiError = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...PRIVATE, ...headers } });

export const apiJson = (body: unknown) => Response.json(body, { headers: PRIVATE });

/**
 * Runs the handler for the verified token owner: 401 without a valid token,
 * 503 when Clerk is unreachable, 500 for anything else. `provision` creates
 * the user row first (for endpoints that write).
 */
export async function withBearer(req: Request, handler: (userId: string) => Promise<Response>, { provision = false } = {}): Promise<Response> {
  let userId: string | null;
  try {
    userId = await (provision ? bearerMember(req) : bearerUserId(req));
  } catch (e) {
    return e instanceof AuthUnavailableError ? apiError(503, "unavailable") : apiError(500, "internal");
  }
  if (!userId) return apiError(401, "unauthorized", { "WWW-Authenticate": 'Bearer realm="berripop"' });
  try {
    return await handler(userId);
  } catch {
    return apiError(500, "internal");
  }
}

/** Far above any /api/v1 request body (a full check-in is well under 1 KB). */
const MAX_BODY = 8_192;

/** The JSON object in the request body, or null for anything else (too large, not JSON, not an object). */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

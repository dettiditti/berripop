import { meResponse } from "@/lib/api/me";
import { getUserEntitlements } from "@/lib/server/entitlements";
import { getLegalStatus } from "@/lib/server/legal";
import { AuthUnavailableError, bearerUserId } from "@/lib/server/mobileAuth";

/**
 * GET /api/v1/me (mobile API): the signed-in member's id, plan and legal
 * state. Read-only; authenticated by a Clerk session token in the
 * Authorization header only. Errors never carry internal details.
 */

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const fail = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...PRIVATE, ...headers } });

export async function GET(req: Request) {
  let userId: string | null;
  try {
    userId = await bearerUserId(req);
  } catch (e) {
    return e instanceof AuthUnavailableError ? fail(503, "unavailable") : fail(500, "internal");
  }
  if (!userId) return fail(401, "unauthorized", { "WWW-Authenticate": 'Bearer realm="berripop"' });
  try {
    const [ent, legal] = await Promise.all([getUserEntitlements(userId), getLegalStatus(userId)]);
    return Response.json(meResponse(userId, ent, legal), { headers: PRIVATE });
  } catch {
    return fail(500, "internal");
  }
}

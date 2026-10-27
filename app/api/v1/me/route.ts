import { meResponse } from "@/lib/api/me";
import { getUserEntitlements } from "@/lib/server/entitlements";
import { getLegalStatus } from "@/lib/server/legal";
import { apiJson, withBearer } from "@/lib/server/mobileApi";

/**
 * GET /api/v1/me (mobile API): the signed-in member's id, plan and legal
 * state. Read-only; authenticated by a Clerk session token in the
 * Authorization header only. Errors never carry internal details.
 */

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withBearer(req, async userId => {
    const [ent, legal] = await Promise.all([getUserEntitlements(userId), getLegalStatus(userId)]);
    return apiJson(meResponse(userId, ent, legal));
  });
}

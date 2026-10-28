import { deleteAccountAndLogin } from "@/lib/server/account";
import { apiError, apiJson, readJsonObject, withBearer } from "@/lib/server/mobileApi";

/**
 * POST /api/v1/account/delete (mobile API): deletes the member's account,
 * with the same rules as the web settings page (lib/server/account.ts):
 *
 * Body: { "confirmation": "TÖRLÉS" } (or "DELETE"; case and spaces ignored).
 * 200 → { deleted: true, loginDeleted } — the data is gone; loginDeleted
 *       false means the Clerk login could not be removed.
 * 400 → { error: "confirmation" } without the confirmation word.
 * 409 → { error: "active_subscription" } while a subscription would keep
 *       renewing (cancel it first; one set to end is fine).
 *
 * Not gated on the Terms (deleting must always be possible), and never
 * creates a user row.
 */

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withBearer(req, async userId => {
    const body = await readJsonObject(req);
    if (!body) return apiError(400, "invalid");
    const r = await deleteAccountAndLogin(userId, body.confirmation);
    if (!r.ok) return r.error === "active_subscription" ? apiError(409, r.error) : apiError(400, "confirmation");
    return apiJson({ deleted: true, loginDeleted: r.loginDeleted });
  });
}

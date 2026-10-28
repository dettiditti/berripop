import { circleToday } from "@/lib/domain/rules";
import { exportAccount } from "@/lib/server/account";
import { PRIVATE, withBearer } from "@/lib/server/mobileApi";

/**
 * GET /api/v1/account/export (mobile API): everything we store about the
 * member, the same export the web settings page downloads. Only the token
 * owner's data. Not gated on the Terms: the right to one's data always
 * applies. Read-only; never creates a user row.
 */

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withBearer(req, async userId => {
    const data = await exportAccount(userId);
    return Response.json(data, {
      headers: { ...PRIVATE, "Content-Disposition": `attachment; filename="berripop-export-${circleToday()}.json"` },
    });
  });
}

import { toCheckinDTO } from "@/lib/checkin/dto";
import { circleToday } from "@/lib/domain/rules";
import { removeCheckin, todayCheckin, writeCheckin } from "@/lib/server/checkin";
import { getLegalStatus } from "@/lib/server/legal";
import { PRIVATE, apiError, apiJson, readJsonObject, withBearer } from "@/lib/server/mobileApi";

/**
 * /api/v1/checkin/today (mobile API): the member's own check-in for today
 * (Europe/Budapest). The day is always the server's, never the client's, and
 * only the token owner's row is read or written.
 *
 * GET    → { date, checkin | null }
 * PUT    → saves or replaces today's check-in (same fields and cleaning as
 *          the web); { date, checkin }. Never calls AI.
 * DELETE → removes today's check-in; 204.
 *
 * Writing needs the current Terms accepted (403 terms_required otherwise);
 * AI consent is a separate matter and not needed here.
 */

export const dynamic = "force-dynamic";

const termsAccepted = async (userId: string) => (await getLegalStatus(userId)).terms === "granted";

export function GET(req: Request) {
  return withBearer(req, async userId => {
    const date = circleToday();
    const row = await todayCheckin(userId, date);
    return apiJson({ date, checkin: row ? toCheckinDTO(row) : null });
  });
}

export function PUT(req: Request) {
  return withBearer(req, async userId => {
    if (!(await termsAccepted(userId))) return apiError(403, "terms_required");
    const input = await readJsonObject(req);
    if (!input) return apiError(400, "invalid");
    const date = circleToday();
    if (!(await writeCheckin(userId, input, date))) return apiError(400, "invalid");
    const row = await todayCheckin(userId, date);
    return row ? apiJson({ date, checkin: toCheckinDTO(row) }) : apiError(500, "internal");
  }, { provision: true });
}

export function DELETE(req: Request) {
  return withBearer(req, async userId => {
    if (!(await termsAccepted(userId))) return apiError(403, "terms_required");
    await removeCheckin(userId, circleToday());
    return new Response(null, { status: 204, headers: PRIVATE });
  });
}

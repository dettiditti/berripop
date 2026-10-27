import { toCheckinDTO } from "@/lib/checkin/dto";
import { circleToday } from "@/lib/domain/rules";
import { todayCheckin } from "@/lib/server/checkin";
import { apiJson, withBearer } from "@/lib/server/mobileApi";

/**
 * GET /api/v1/checkin/today (mobile API): the member's own check-in for
 * today (Europe/Budapest), or null. Read-only; the same shape the web app
 * gets in its snapshot. Only the token owner's row is ever read.
 */

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withBearer(req, async userId => {
    const date = circleToday();
    const row = await todayCheckin(userId, date);
    return apiJson({ date, checkin: row ? toCheckinDTO(row) : null });
  });
}

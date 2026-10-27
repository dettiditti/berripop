import type { dailyCheckins } from "../db/schema";
import type { CheckinDTO } from "../domain/types";
import type { CheckinNeed, CheckinState, CheckinTopic } from "./checkin";

export function toCheckinDTO(r: typeof dailyCheckins.$inferSelect): CheckinDTO {
  return {
    date: r.date,
    state: r.state as CheckinState | null,
    topics: r.topics as CheckinTopic[],
    note: r.note,
    need: r.need as CheckinNeed | null,
    aiReply: r.aiReply ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

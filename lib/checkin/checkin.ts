/**
 * The daily check-in: how the member is, what is on their mind, and what
 * would help. Every part is optional. The answer they get back is written
 * in advance (no AI), so it is instant and free; an AI follow-up is a
 * separate request they start themselves. A check-in never earns XP or
 * counts towards a streak.
 */

export const CHECKIN_STATES = ["good", "calm", "tired", "tense", "sad", "mixed"] as const;
export type CheckinState = (typeof CHECKIN_STATES)[number];

export const CHECKIN_TOPICS = ["work", "relationships", "family", "health", "self", "money", "other"] as const;
export type CheckinTopic = (typeof CHECKIN_TOPICS)[number];

/** What would help today. "note" means: just note it down. */
export const CHECKIN_NEEDS = ["listen", "reflect", "practical", "note"] as const;
export type CheckinNeed = (typeof CHECKIN_NEEDS)[number];

export const MAX_TOPICS = 3;
export const MAX_NOTE = 500;

export type CheckinInput = { state?: unknown; topics?: unknown; note?: unknown; need?: unknown };
export type CleanCheckin = { state: CheckinState | null; topics: CheckinTopic[]; note: string; need: CheckinNeed | null };

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list.includes(v as T) ? (v as T) : null);

/** Keeps only known options and a short note; null when nothing was given at all. */
export function cleanCheckin(input: CheckinInput): CleanCheckin | null {
  const state = oneOf(CHECKIN_STATES, input.state);
  const topics = [...new Set((Array.isArray(input.topics) ? input.topics : []).map(t => oneOf(CHECKIN_TOPICS, t)).filter((t): t is CheckinTopic => !!t))].slice(0, MAX_TOPICS);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : "";
  const need = oneOf(CHECKIN_NEEDS, input.need);
  if (!state && !topics.length && !note && !need) return null;
  return { state, topics, note, need };
}

/** Keys of the prepared answer: an acknowledgement for the state and a line for the need. */
export function responseKeys(c: Pick<CleanCheckin, "state" | "need">): { state: CheckinState | "none"; need: CheckinNeed | "none" } {
  return { state: c.state ?? "none", need: c.need ?? "none" };
}

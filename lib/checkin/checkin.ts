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

/** The AI follow-up ("think it through together"): what it heard, one question, maybe one idea. */
export type CheckinReply = { heard: string; question: string; idea: string | null; safety: boolean };

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Parses the model's JSON; anything without a heard line and a question is rejected rather than shown. */
export function parseCheckinReply(raw: string): CheckinReply | null {
  const body = (raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  const heard = text(obj.heard, 400);
  const question = text(obj.question, 300);
  if (!heard || !question) return null;
  return { heard, question, idea: text(obj.idea, 300), safety: obj.safety === true };
}

export type CheckinWeek = { days: number; topics: [CheckinTopic, number][]; needs: [CheckinNeed, number][] };

/** Counts only: which topics came up and what help was asked for. No notes, no feelings, no dates. */
export function summarizeCheckins(rows: { topics: unknown; need: unknown }[]): CheckinWeek {
  const topics = new Map<CheckinTopic, number>();
  const needs = new Map<CheckinNeed, number>();
  for (const r of rows) {
    for (const t of Array.isArray(r.topics) ? r.topics : []) {
      const k = oneOf(CHECKIN_TOPICS, t);
      if (k) topics.set(k, (topics.get(k) ?? 0) + 1);
    }
    const n = oneOf(CHECKIN_NEEDS, r.need);
    if (n) needs.set(n, (needs.get(n) ?? 0) + 1);
  }
  const sorted = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { days: rows.length, topics: sorted(topics), needs: sorted(needs) };
}

/** The weekly journal's view of the check-ins: one line of counts, or nothing. */
export function checkinWeekLine(w: CheckinWeek): string {
  if (!w.days) return "";
  const list = (xs: [string, number][]) => (xs.length ? xs.map(([k, n]) => `${k} ×${n}`).join(", ") : "none");
  return `Daily check-ins this week (counts only, not their words): ${w.days} days; topics: ${list(w.topics)}; help asked for: ${list(w.needs)}.`;
}

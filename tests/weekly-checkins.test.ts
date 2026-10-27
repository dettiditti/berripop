import { describe, expect, it, vi } from "vitest";
import { dailyCheckins, journalEntries } from "../lib/db/schema";
import { checkinWeekLine, summarizeCheckins } from "../lib/checkin/checkin";
import { dictionaries } from "../lib/i18n/dictionaries";

/*
 * The weekly journal sees the week's check-ins only as counts of topics and
 * of the help asked for: never notes, feelings or dates, and never as
 * something the member "said". In-memory stand-ins; nothing reaches Neon or
 * an AI provider.
 */

const secret = "Ezt csak a check-inbe írtam, senki ne lássa.";
const checkins = [
  { topics: ["work", "family"], need: "listen", state: "sad", note: secret },
  { topics: ["work"], need: "practical", state: "tense", note: "" },
  { topics: ["work", "bogus"], need: "listen", state: null, note: "" },
];

function chain(rows: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const k of ["where", "orderBy", "limit"]) c[k] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej);
  return c;
}

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    // Like the real query, only the selected columns come back.
    select: (cols?: Record<string, unknown>) => ({
      from: (t: unknown) => chain(() => {
        if (t === dailyCheckins) return checkins.map(r => Object.fromEntries(Object.keys(cols ?? r).map(k => [k, (r as Record<string, unknown>)[k]])));
        if (t === journalEntries) return [{ id: "e1", date: "2026-10-26", entryDate: "2026-10-26", status: "saved", body: "Ma végre szóltam a főnökömnek.", createdAt: new Date(), updatedAt: new Date() }];
        return [];
      }),
    }),
    insert: () => ({ values: async () => {} }),
  }),
}));
vi.mock("../lib/server/legal", () => ({ aiAllowedFor: async () => true }));
vi.mock("../lib/server/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/server/progress", () => ({ grantGrowthXp: vi.fn() }));
vi.mock("../lib/server/entitlements", () => ({
  consumeAiAllowance: async () => true,
  refundAiAllowance: async () => {},
  getAiUsage: async () => ({ used: 0, limit: 3, remaining: 3, reached: false, resets: "2026-11-02" }),
  getUserEntitlements: async () => ({ limits: { insightContext: true, weeklyJournal: true } }),
  canAccessWeeklyJournal: async () => true,
}));

const { weeklyJournal } = await import("../lib/server/journal");
const { setAiGeneratorForTesting } = await import("../lib/server/ai");

describe("check-in summary", () => {
  it("counts topics and needs, most frequent first, ignoring unknown values", () => {
    expect(summarizeCheckins(checkins)).toEqual({ days: 3, topics: [["work", 3], ["family", 1]], needs: [["listen", 2], ["practical", 1]] });
  });

  it("is a single line of counts, or nothing without check-ins", () => {
    expect(checkinWeekLine(summarizeCheckins([]))).toBe("");
    expect(checkinWeekLine(summarizeCheckins(checkins))).toBe("Daily check-ins this week (counts only, not their words): 3 days; topics: work ×3, family ×1; help asked for: listen ×2, practical ×1.");
  });
});

describe("weekly journal", () => {
  it("gets the counts, but never a check-in note or feeling, and keeps youSaid for their own words", async () => {
    let prompt = "";
    let instructions = "";
    setAiGeneratorForTesting(async req => {
      prompt = req.prompt;
      instructions = req.instructions;
      return { text: JSON.stringify({ youSaid: ["Szóltál a főnöködnek."], maybe: [], questions: [], proposals: [] }) };
    });
    const r = await weeklyJournal("u", "hu");
    expect(r.ok).toBe(true);
    expect(prompt).toContain("work ×3");
    expect(prompt).toContain("listen ×2");
    expect(prompt).not.toContain(secret);
    expect(prompt).not.toMatch(/sad|tense|Szomorú|Feszült/);
    expect(prompt).toContain("Ma végre szóltam a főnökömnek.");
    expect(instructions).toContain(dictionaries.hu.journal.ai.weeklyInstructions);
    expect(instructions).toMatch(/soha ne kerüljenek a youSaid listába/);
  });
});

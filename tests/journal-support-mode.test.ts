import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalEntries, journalReflections } from "../lib/db/schema";
import { isSupportMode, parseReflection } from "../lib/journal/reflection";
import { dictionaries } from "../lib/i18n/dictionaries";

/*
 * The deeper journal reflection: support mode per request, alternative
 * readings kept as possibilities, and the same privacy rules as before (only
 * this entry and goal titles reach the AI). In-memory stand-ins; no request
 * reaches Neon or an AI provider.
 */

const entry = { id: "e1", userId: "u", body: "I always help everyone, even when I'm exhausted. I feel selfish when I say no.", status: "saved", entryDate: "2026-10-27", createdAt: new Date(), updatedAt: new Date() };
const inserted: Record<string, unknown>[] = [];

/** A query chain that can be awaited at any step; rows depend on the table. */
function chain(rows: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const k of ["where", "orderBy", "limit"]) c[k] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej);
  return c;
}

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: (t: unknown) => chain(() => (t === journalEntries ? [entry] : t === journalReflections ? inserted.map(v => ({ ...v, id: "r1", createdAt: new Date(), feedback: null, correction: null })) : [])) }),
    insert: (t: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (t === journalReflections) inserted.push(v);
        return { returning: async () => [{ id: "r1" }], then: (r: (x: unknown) => unknown) => Promise.resolve().then(r) };
      },
    }),
  }),
}));
vi.mock("../lib/server/legal", () => ({ aiAllowedFor: async () => true }));
vi.mock("../lib/server/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/server/progress", () => ({ grantGrowthXp: vi.fn() }));
vi.mock("../lib/server/entitlements", () => ({
  consumeAiAllowance: async () => true,
  refundAiAllowance: async () => {},
  getAiUsage: async () => ({ used: 0, limit: 3, remaining: 3, reached: false, resets: "2026-11-02" }),
  getUserEntitlements: async () => ({ limits: { insightContext: false, weeklyJournal: false } }),
  canAccessWeeklyJournal: async () => false,
}));

const { reflectOnEntry } = await import("../lib/server/journal");
const { setAiGeneratorForTesting } = await import("../lib/server/ai");

const reply = { noticed: "You wrote that you say yes even when exhausted.", strength: null, explore: "What feels hardest about saying no?", nextStep: "Try one small no this week.", alternatives: ["Maybe saying no feels like letting people down.", "Maybe helping is how you feel useful."], suggestion: null };
let seen: { instructions: string; prompt: string } | null = null;

beforeEach(() => {
  inserted.length = 0;
  seen = null;
  setAiGeneratorForTesting(async req => {
    seen = { instructions: req.instructions, prompt: req.prompt };
    return { text: JSON.stringify(reply) };
  });
});

describe("support mode", () => {
  it("adds the chosen mode's instructions and stores the mode and alternatives", async () => {
    const r = await reflectOnEntry("u", "e1", "en", false, "practical");
    expect(r.ok).toBe(true);
    expect(seen!.instructions).toContain(dictionaries.en.journal.ai.modes.practical);
    expect(seen!.instructions).not.toContain(dictionaries.en.journal.ai.modes.listen);
    expect(inserted[0]).toMatchObject({ mode: "practical", alternatives: reply.alternatives });
    if (r.ok) expect(r.state.reflections[0]).toMatchObject({ mode: "practical", alternatives: reply.alternatives });
  });

  it("falls back to thinking it through together for an unknown mode", async () => {
    await reflectOnEntry("u", "e1", "hu", false, "diagnose me");
    expect(seen!.instructions).toContain(dictionaries.hu.journal.ai.modes.reflect);
    expect(inserted[0].mode).toBe("reflect");
  });

  it("sends only this entry and goal titles, never other entries", async () => {
    await reflectOnEntry("u", "e1", "en", false, "listen");
    expect(seen!.prompt).toContain(entry.body);
    expect(seen!.prompt).toContain("Goals: none");
    expect(seen!.prompt).not.toMatch(/Insights they approved/);
  });

  it("recognises only the three modes", () => {
    expect(["listen", "reflect", "practical"].every(isSupportMode)).toBe(true);
    expect(isSupportMode("therapy")).toBe(false);
  });
});

describe("prompt guardrails", () => {
  for (const locale of ["hu", "en"] as const) {
    it(`${locale}: asks one question, separates facts from hypotheses, never diagnoses`, () => {
      const p = dictionaries[locale].journal.ai.reflectInstructions;
      expect(p).toMatch(locale === "hu" ? /pontosan egy nyitott/ : /exactly one open/);
      expect(p).toMatch(locale === "hu" ? /lehet, hogy/ : /maybe/);
      expect(p).toMatch(locale === "hu" ? /Soha ne diagnosztizálj/ : /Never diagnose/);
      expect(p).toContain("alternatives");
    });
  }
});

describe("parsing alternatives", () => {
  it("keeps up to three non-empty strings, capped in length", () => {
    const r = parseReflection(JSON.stringify({ noticed: "a", explore: "b?", alternatives: ["x", 4, "", "y".repeat(400), "z", "w"] }), []);
    expect(r!.alternatives).toEqual(["x", "y".repeat(250), "z"]);
  });

  it("is an empty list when missing (older replies)", () => {
    expect(parseReflection(JSON.stringify({ noticed: "a", explore: "b?" }), [])!.alternatives).toEqual([]);
  });
});

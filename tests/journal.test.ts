import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "../lib/billing/plans";
import { parseReflection, parseWeekly } from "../lib/journal/reflection";

const goal = "11111111-1111-1111-1111-111111111111";

describe("journal reflection parsing", () => {
  it("parses a valid reflection, including fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      noticed: "You wrote that the walk cleared your head.",
      strength: "You asked a colleague for help.",
      explore: "What made asking easier this time?",
      nextStep: null,
      suggestion: { kind: "exercise", text: "Take a 10-minute walk before tough meetings.", goalId: goal },
    }) + "\n```";
    const r = parseReflection(raw, [goal]);
    expect(r?.noticed).toContain("walk");
    expect(r?.nextStep).toBeNull();
    expect(r?.suggestion).toEqual({ kind: "exercise", text: "Take a 10-minute walk before tough meetings.", goalId: goal });
  });
  it("drops a suggestion pointing at a goal that isn't the user's", () => {
    const r = parseReflection(JSON.stringify({ noticed: "a b c", explore: "q?", suggestion: { kind: "theme", text: "Rest", goalId: "someone-elses-goal" } }), [goal]);
    expect(r?.suggestion).toEqual({ kind: "theme", text: "Rest", goalId: null });
  });
  it("rejects malformed or incomplete output instead of showing it", () => {
    expect(parseReflection("Sorry, I can't help with that.", [])).toBeNull();
    expect(parseReflection(JSON.stringify({ noticed: "only this" }), [])).toBeNull();
    expect(parseReflection("{not json", [])).toBeNull();
  });
  it("ignores unknown suggestion kinds and caps field length", () => {
    const r = parseReflection(JSON.stringify({ noticed: "x".repeat(5000), explore: "q?", suggestion: { kind: "diagnosis", text: "nope" } }), []);
    expect(r?.noticed.length).toBe(600);
    expect(r?.suggestion).toBeNull();
  });
});

describe("weekly journal parsing", () => {
  it("keeps the person's own statements apart from AI possibilities", () => {
    const w = parseWeekly(JSON.stringify({
      youSaid: ["You tried going to bed earlier.", "Talking to Anna helped."],
      maybe: ["Maybe evenings are when you recharge."],
      questions: ["What would make mornings easier?"],
      proposals: [{ kind: "theme", text: "Evening routines" }, { kind: "bogus", text: "x" }],
    }));
    expect(w?.youSaid).toHaveLength(2);
    expect(w?.maybe).toHaveLength(1);
    expect(w?.proposals).toEqual([{ kind: "theme", text: "Evening routines" }]);
  });
  it("returns null when there's nothing usable", () => {
    expect(parseWeekly(JSON.stringify({ youSaid: [], maybe: [], questions: [] }))).toBeNull();
    expect(parseWeekly("plain text")).toBeNull();
  });
});

describe("journal plan limits", () => {
  it("Free has a limited reflection allowance; Premium more and the weekly reflection", () => {
    expect(PLAN_LIMITS.free.journalAiPerPeriod).toBeGreaterThan(0);
    expect(PLAN_LIMITS.premium.journalAiPerPeriod).toBeGreaterThan(PLAN_LIMITS.free.journalAiPerPeriod);
    expect(PLAN_LIMITS.free.weeklyJournal).toBe(false);
    expect(PLAN_LIMITS.premium.weeklyJournal).toBe(true);
    expect(PLAN_LIMITS.free.insightContext).toBe(false);
  });
});

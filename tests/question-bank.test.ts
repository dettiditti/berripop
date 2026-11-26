import { describe, expect, it } from "vitest";
import { builtInQuestions, journeyNodes, journeyQuestions, legacyJourneyId, legacyJourneyQuestions } from "../lib/content";
import { bankQuestion, bankQuestions, CHALLENGE_ALT_DAYS, journeyPlan } from "../lib/questions/bank";
import { companionDays, resolveQuestion } from "../lib/domain/rules";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";

const qs = (d: typeof en) => d.content.questions as Record<string, { text: string; prompts: string[] }>;

describe("question bank", () => {
  it("has 133 questions with unique ids, text in both languages and no banned words", () => {
    expect(bankQuestions).toHaveLength(133);
    expect(new Set(bankQuestions.map(b => b.id)).size).toBe(133);
    for (const b of bankQuestions) {
      for (const d of [hu, en]) expect(qs(d)[b.id]?.text, b.id).toBeTruthy();
      expect(qs(hu)[b.id].text).not.toMatch(/\b(mindig|soha|csak azért|trauma|toxikus|nárcisztikus)\b/i);
      expect(qs(en)[b.id].prompts).toHaveLength(qs(hu)[b.id].prompts.length);
    }
  });

  it("puts 54 journey-safe bank questions on the journey, one per family", () => {
    const days = journeyNodes.filter(n => n.kind === "quest").map(n => bankQuestion(n.questionId)!);
    expect(days).toHaveLength(54);
    expect(new Set(days.map(b => b.id)).size).toBe(54);
    for (const b of days) {
      expect(b.followUpOnly, b.id).toBe(false);
      expect(b.depth === 1 || b.depth === 2, b.id).toBe(true);
      expect(b.sensitivity, b.id).toBe("light");
      expect(b.only, b.id).toBeUndefined();
      expect(["G1", "G2", "G3"]).not.toContain(b.subtheme);
    }
    const families = days.map(b => b.family).filter(Boolean);
    expect(new Set(families).size).toBe(families.length);
  });

  it("only goes to level 2 in a theme after a level-1 day of that theme", () => {
    const days = journeyNodes.filter(n => n.kind === "quest").map(n => ({ day: n.day, b: bankQuestion(n.questionId)! }));
    for (const { day, b } of days.filter(x => x.b.depth === 2)) {
      expect(days.some(x => x.day < day && x.b.theme === b.theme && x.b.depth === 1), `day ${day} ${b.id}`).toBe(true);
    }
  });

  it("never puts the same subtheme on two days in a row", () => {
    for (let i = 1; i < journeyPlan.length; i++) {
      const a = bankQuestion(journeyPlan[i - 1]), b = bankQuestion(journeyPlan[i]);
      if (a && b) expect(a.subtheme, `days ${i} and ${i + 1}`).not.toBe(b.subtheme);
    }
  });

  it("keeps the old journey ids resolvable for old answers", () => {
    expect(legacyJourneyQuestions).toHaveLength(63);
    for (const q of legacyJourneyQuestions) {
      expect(resolveQuestion(q.id, null), q.id).toBeTruthy();
      for (const d of [hu, en]) expect(qs(d)[q.id]?.text, q.id).toBeTruthy();
    }
    expect(legacyJourneyId(1)).toBe("j01");
    expect(new Set(builtInQuestions.map(q => q.id)).size).toBe(builtInQuestions.length);
    expect(journeyQuestions[41].id).toBe("k42");
  });

  it("offers a thinking-it-through version on the five action challenges", () => {
    for (const d of [hu, en]) {
      expect(Object.keys(d.journey.challengeAlt).map(Number).sort((a, b) => a - b)).toEqual([...CHALLENGE_ALT_DAYS]);
      for (const day of CHALLENGE_ALT_DAYS) expect(journeyNodes[day - 1].kind).toBe("challenge");
    }
  });
});

describe("Good Companion badge", () => {
  const doneIn = (...days: number[]) => Object.fromEntries(days.map(d => [d, "2026-11-20"]));
  it("counts at most two days each from week 2 and week 8", () => {
    expect(companionDays({})).toBe(0);
    expect(companionDays(doneIn(8, 9, 10, 11))).toBe(2);
    expect(companionDays(doneIn(8, 9, 50))).toBe(3);
    expect(companionDays(doneIn(8, 14, 50, 56))).toBe(4);
    expect(companionDays(doneIn(1, 2, 3, 22))).toBe(0);
  });
});

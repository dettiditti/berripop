import { describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { baseRef, bankQuestion, journeyPlan } from "../lib/questions/bank";
import { circleDailyPool, isLight, nextRepeat, personalDailyPool, pickCircleQuestion, pickPersonalQuestion, type SeenQuestion } from "../lib/questions/pickNext";
import { resolveQuestion } from "../lib/domain/rules";
import { splitChoice } from "../lib/questions/choices";

const day = "2026-12-01";
const allDone = Object.fromEntries(journeyPlan.map((_, i) => [i + 1, true]));
const base = { seed: "u:test", date: day, seen: [] as SeenQuestion[], answered: [] as string[], journeyDone: {} };

/**
 * Walks `n` days of own daily questions, answering each. With `journey`, the member
 * also walks the 63-day journey alongside (done before the daily question).
 */
function walk(n: number, start = day, journeyDone: Record<number, unknown> = {}, journey = false) {
  const seen: SeenQuestion[] = [];
  const answered: string[] = [];
  const refs: string[] = [];
  const done: Record<number, unknown> = { ...journeyDone };
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    if (journey && i < journeyPlan.length && bankQuestion(journeyPlan[i])) {
      done[i + 1] = true;
      seen.push({ ref: journeyPlan[i], date });
      answered.push(journeyPlan[i]);
    }
    const ref = pickPersonalQuestion({ seed: "u:walker", date, seen, answered, journeyDone: done });
    refs.push(ref);
    seen.push({ ref, date });
    answered.push(ref);
  }
  return { refs, seen, daily: seen.filter(s => refs.includes(s.ref)) };
}

describe("personal daily question", () => {
  it("is stable for a member and day", () => {
    expect(pickPersonalQuestion(base)).toBe(pickPersonalQuestion(base));
  });

  it("only uses level 1-2 bank questions that may come on their own", () => {
    for (const b of personalDailyPool) {
      expect([1, 2]).toContain(b.depth);
      expect(b.followUpOnly).toBe(false);
      expect(b.only).toBeUndefined();
      expect(["G1", "G2", "G3"]).not.toContain(b.subtheme);
    }
    expect(personalDailyPool.some(b => b.id === "G4.3")).toBe(false);
  });

  it("leaves the questions of journey days still ahead for the journey", () => {
    const { refs } = walk(40);
    for (const r of refs) expect(journeyPlan.includes(baseRef(r))).toBe(false);
  });

  it("keeps family waits alongside the journey while new questions last", () => {
    const { seen, refs } = walk(40, day, {}, true);
    seen.forEach((s, i) => {
      if (!refs.includes(s.ref)) return;
      const b = bankQuestion(s.ref)!;
      const before = seen.slice(0, i);
      const inDays = (n: number) => before.filter(o => o.date > addDays(s.date, -n));
      if (b.family) expect(inDays(45).filter(o => bankQuestion(o.ref)!.family === b.family).map(o => o.ref)).toEqual([]);
    });
  });

  it("keeps subthemes to one a week and a theme to two days while new questions last", () => {
    const { seen } = walk(30);
    seen.forEach((s, i) => {
      const b = bankQuestion(s.ref)!;
      const days = seen.slice(0, i).filter(o => o.date > addDays(s.date, -7) && bankQuestion(o.ref)!.theme === b.theme).map(o => o.date);
      expect(new Set(days).size).toBeLessThan(2);
      expect(seen.slice(0, i).filter(o => o.date > addDays(s.date, -7) && bankQuestion(o.ref)!.subtheme === b.subtheme)).toEqual([]);
    });
  });

  it("never asks level 2 before a level-1 answer in the theme", () => {
    const { seen } = walk(60);
    seen.forEach((s, i) => {
      const b = bankQuestion(s.ref)!;
      if (b.depth !== 2) return;
      expect(seen.slice(0, i).some(o => bankQuestion(o.ref)!.theme === b.theme && bankQuestion(o.ref)!.depth === 1)).toBe(true);
    });
  });

  it("starts with light questions and keeps at least three light days a week alongside the journey", () => {
    expect(walk(3).refs.every(r => isLight(bankQuestion(r)!))).toBe(true);
    const { seen } = walk(60, day, {}, true);
    for (let i = 7; i < 60; i++) {
      const from = addDays(day, i - 7), to = addDays(day, i);
      const lightDays = new Set(seen.filter(s => s.date >= from && s.date < to && isLight(bankQuestion(s.ref)!)).map(s => s.date));
      expect(lightDays.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives a light question after setting one aside, never the same", () => {
    const first = pickPersonalQuestion({ ...base, journeyDone: allDone });
    const seen = [{ ref: first, date: day }];
    const next = pickPersonalQuestion({ ...base, journeyDone: allDone, seen, lightOnly: true, exclude: [first] });
    expect(next).not.toBe(first);
    expect(isLight(bankQuestion(next)!)).toBe(true);
  });

  it("a set-aside question waits like an asked one, but does not count as answered", () => {
    const first = pickPersonalQuestion({ ...base, journeyDone: allDone });
    const later = walk(20, addDays(day, 1), allDone).refs;
    expect(later).not.toContain(first);
  });

  it("brings back the question asked longest ago as a repeat when everything is used", () => {
    const { refs } = walk(200, day, allDone);
    const repeats = refs.filter(r => /:r\d+$/.test(r));
    expect(repeats.length).toBeGreaterThan(0);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("circle daily question", () => {
  it("only uses ⭕ questions and the circle's own", () => {
    expect(circleDailyPool.length).toBe(24);
    const seen: SeenQuestion[] = [];
    for (let i = 0; i < 40; i++) {
      const date = addDays(day, i);
      const ref = pickCircleQuestion({ seed: "circle", date, seen, answered: [], customRefs: ["c:own1"], answeredInCircle: [] });
      expect(ref === "c:own1" || bankQuestion(ref)?.circleSafe === true || baseRef(ref) === "c:own1").toBe(true);
      seen.push({ ref, date });
    }
  });

  it("prefers what nobody in the circle answered yet", () => {
    const answered = circleDailyPool.map(b => b.id).filter(id => id !== "I3.2");
    const ref = pickCircleQuestion({ seed: "circle", date: day, seen: [], answered, customRefs: [], answeredInCircle: answered });
    expect(ref).toBe("I3.2");
  });
});

describe("repeats", () => {
  it("count up and resolve to the same question under their own ref", () => {
    expect(nextRepeat("A1.3", ["A1.3"])).toBe("A1.3:r2");
    expect(nextRepeat("A1.3", ["A1.3", "A1.3:r2"])).toBe("A1.3:r3");
    const q = resolveQuestion("A1.3:r2", null)!;
    expect(q.id).toBe("A1.3:r2");
    expect(q.theme).toBe(resolveQuestion("A1.3", null)!.theme);
  });
});

describe("answer buttons", () => {
  it("split a saved answer back into the button and the words after it", () => {
    const list = ["alvás", "csend", "nem tudom"];
    expect(splitChoice("csend", list)).toEqual(["csend", ""]);
    expect(splitChoice("csend – egy órára", list)).toEqual(["csend", "egy órára"]);
    expect(splitChoice("csendes délután kellene", list)).toEqual(["", "csendes délután kellene"]);
    expect(splitChoice("bármi", null)).toEqual(["", "bármi"]);
  });
});

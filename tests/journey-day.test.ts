import { describe, expect, it } from "vitest";
import { journeyNodes, legacyJourneyQuestions } from "../lib/content";
import { bankQuestion } from "../lib/questions/bank";
import { journeyDayAccepts, journeyQuestionFor } from "../lib/questions/journeyDay";
import { lookBackFor, lookBackGroups } from "../lib/questions/lookBack";

/** Refs a member who walked days 1..n of the new journey answered. */
const walked = (n: number) => journeyNodes.slice(0, n).map(x => x.questionId);
/** Someone who walked days 1..n with the first journey's questions. */
const walkedOld = (n: number) => legacyJourneyQuestions.slice(0, n).map(q => q.id);

describe("journey day question (depth prerequisite)", () => {
  it("asks every day's own question when the days were walked in order", () => {
    for (const n of journeyNodes) expect(journeyQuestionFor(n.day, walked(n.day - 1)).ref, `day ${n.day}`).toBe(n.questionId);
  });

  it("gives an easier level-1 question of the same theme on a level-2 day without one", () => {
    // Day 30 (A5.3, level 2) after 29 days of the first journey: no feelings question answered yet.
    const q = journeyQuestionFor(30, walkedOld(29));
    expect(q.deeper).toBe("A5.3");
    const easier = bankQuestion(q.ref)!;
    expect(easier.theme).toBe("A");
    expect(easier.depth).toBe(1);
    expect(easier.followUpOnly).toBe(false);
    // Not a question still ahead on the journey.
    expect(journeyNodes.slice(29).map(n => n.questionId)).not.toContain(q.ref);
  });

  it("keeps level-1 days as they are, and asks the deep one once the theme has a level-1 answer", () => {
    expect(journeyQuestionFor(29, walkedOld(28))).toEqual({ ref: "A4.1" });
    expect(journeyQuestionFor(30, [...walkedOld(29), "A1.3"])).toEqual({ ref: "A5.3" });
  });

  it("counts the day with the stand-in, the day's own question, or the one it was done with", () => {
    const answered = walkedOld(29);
    const easier = journeyQuestionFor(30, answered).ref;
    expect(journeyDayAccepts(30, easier, answered)).toBe(true);
    expect(journeyDayAccepts(30, "A5.3", answered)).toBe(true);
    expect(journeyDayAccepts(30, "C5.1", answered)).toBe(false);
    // Revisiting a finished day with the question it was done with.
    expect(journeyDayAccepts(30, easier, [...answered, easier], easier)).toBe(true);
    expect(journeyDayAccepts(5, "j05", [], "j05")).toBe(true);
  });
});

describe("look-back days", () => {
  it("shows week 1 on days 7 and 21, weeks 4-6 on day 42, the first-and-last pair on day 63", () => {
    expect(lookBackGroups(7)).toEqual([{ key: 1, days: [1, 2, 3, 4, 5, 6] }]);
    expect(lookBackGroups(21)).toEqual(lookBackGroups(7));
    expect(lookBackGroups(42).map(g => g.key)).toEqual([4, 5, 6]);
    expect(lookBackGroups(63)[0]).toEqual({ key: "pair", days: [3, 62] });
    expect(lookBackGroups(14)).toEqual([]);
  });

  it("only lists days that have an answer, and leaves out empty groups", () => {
    const lb = lookBackFor(63, day => (day === 3 ? { question: "q", answer: "three words" } : null));
    expect(lb).toEqual([{ key: "pair", items: [{ day: 3, question: "q", answer: "three words" }] }]);
  });
});

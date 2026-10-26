import { describe, expect, it } from "vitest";
import { journeyNodes, libraryQuestions, XP_RULES } from "../lib/content";
import { cleanMoment, growthXpFor, personalBadges, personalFacts, pickPersonalDaily } from "../lib/domain/personal";
import { streakOf } from "../lib/progress";

const none = { answeredRefs: [], journey: {}, xp: [], activityDates: [] };

describe("personal facts and badges", () => {
  it("nothing done, no badges", () => {
    expect(personalBadges(personalFacts(none))).toEqual([]);
  });
  it("the first answer anywhere is the first tiny step; repeats of one question count once", () => {
    const f = personalFacts({ ...none, answeredRefs: ["j01", "j01"] });
    expect(f.answered).toBe(1);
    expect(personalBadges(f)).toEqual(["first-tiny-step"]);
  });
  it("a finished first week unlocks the explorer badge", () => {
    const journey = Object.fromEntries(journeyNodes.filter(n => n.week === 1).map(n => [n.day, "2026-10-01"]));
    const f = personalFacts({ ...none, journey, answeredRefs: journeyNodes.filter(n => n.week === 1).map(n => n.questionId) });
    expect(f.weeksDone).toBe(1);
    expect(personalBadges(f)).toEqual(expect.arrayContaining(["first-tiny-step", "seven-little-wins", "journey-explorer"]));
  });
  it("never awards circle-only badges on your own", () => {
    const journey = Object.fromEntries(journeyNodes.map(n => [n.day, "2026-10-01"]));
    const f = personalFacts({ ...none, journey, answeredRefs: journeyNodes.map(n => n.questionId) });
    expect(personalBadges(f)).toContain("full-bunch");
    expect(personalBadges(f)).not.toContain("growing-together");
  });
  it("themes tried come from new-topic XP; streak dates include XP days (steps, journal)", () => {
    const f = personalFacts({ ...none, xp: [{ reason: "new-topic", date: "2026-10-24" }, { reason: "journal", date: "2026-10-25" }], activityDates: ["2026-10-24"] });
    expect(f.themesTried).toBe(1);
    expect([...f.myActiveDates].sort()).toEqual(["2026-10-24", "2026-10-25"]);
    expect(streakOf(f.myActiveDates, "2026-10-25").current).toBe(2);
  });
});

describe("growth XP", () => {
  it("is modest and capped per day across steps and the journal", () => {
    expect(growthXpFor("step", 0)).toBe(XP_RULES.step);
    expect(growthXpFor("journal", XP_RULES.growthDailyCap - XP_RULES.journal)).toBe(XP_RULES.journal);
    expect(growthXpFor("journal", XP_RULES.growthDailyCap - XP_RULES.journal + 1)).toBe(0);
    expect(XP_RULES.growthDailyCap).toBeLessThan(XP_RULES.daily);
  });
});

describe("personal daily question", () => {
  it("is stable for a member and day, from the library, and avoids used ones", () => {
    const a = pickPersonalDaily("user_1", "2026-10-26", []);
    expect(pickPersonalDaily("user_1", "2026-10-26", [])).toBe(a);
    expect(libraryQuestions.some(q => q.id === a)).toBe(true);
    expect(pickPersonalDaily("user_1", "2026-10-26", [a])).not.toBe(a);
  });
});

describe("inner world moments", () => {
  it("keeps only known words and prompts and trims own words", () => {
    expect(cleanMoment({ words: ["calm", "made-up", "calm", 3], ownWords: ["  mine  ", "x".repeat(50), ""], promptId: "nubi-1", note: "  hi " }))
      .toEqual({ words: ["calm"], ownWords: ["mine", "x".repeat(30)], promptId: "nubi-1", note: "hi" });
    expect(cleanMoment({ words: [], ownWords: [], promptId: "evil", note: "a" })?.promptId).toBeNull();
  });
  it("refuses an empty moment and odd input", () => {
    expect(cleanMoment({ words: [], ownWords: [], promptId: null, note: "   " })).toBeNull();
    expect(cleanMoment({ words: "calm", ownWords: null, promptId: 5, note: {} })).toBeNull();
  });
});

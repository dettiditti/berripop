import { describe, expect, it } from "vitest";
import { CHAPTER_DAYS, CHAPTERS, chapterNodes, chapterOf, chapterWeeks, journeyNodes, weeks } from "../lib/content";
import { journeyStateFor } from "../lib/domain/rules";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";

describe("journey chapters", () => {
  it("has three chapters of 21 days, a challenge every 7th day", () => {
    expect(CHAPTERS).toBe(3);
    expect(journeyNodes).toHaveLength(63);
    for (let c = 1; c <= CHAPTERS; c++) {
      expect(chapterNodes(c)).toHaveLength(CHAPTER_DAYS);
      expect(chapterWeeks(c)).toEqual([3 * c - 2, 3 * c - 1, 3 * c]);
    }
    expect(journeyNodes.filter(n => n.kind === "challenge").map(n => n.day)).toEqual([7, 14, 21, 28, 35, 42, 49, 56, 63]);
    expect([1, 21, 22, 42, 43, 63].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(weeks).toHaveLength(9);
  });

  it("has every day's question, title and week in Hungarian and English", () => {
    for (const dict of [hu, en]) {
      expect(dict.journey.titles).toHaveLength(63);
      expect(dict.journey.chapters).toHaveLength(CHAPTERS);
      for (const n of journeyNodes) {
        const q = dict.content.questions[n.questionId as keyof typeof dict.content.questions] as { text: string; prompts: string[] } | undefined;
        expect(q?.text, `${n.questionId}`).toBeTruthy();
        expect(q?.prompts).toHaveLength(2);
      }
      for (const w of weeks) expect(dict.journey.weeks[`w${w.week}` as keyof typeof dict.journey.weeks]?.theme).toBeTruthy();
    }
  });

  it("opens day 22 the day after day 21, not the same day", () => {
    const done = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i + 1, "2026-10-25"]));
    expect(journeyStateFor(done, "2026-10-26").stateOf(22)).toBe("current");
    expect(journeyStateFor({ ...done, 21: "2026-10-26" }, "2026-10-26").stateOf(22)).toBe("tomorrow");
  });
});

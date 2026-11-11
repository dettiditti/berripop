import { describe, expect, it } from "vitest";
import { feelingWords } from "../lib/content";
import { CHECKIN_STATES } from "../lib/checkin/checkin";
import { calendarMoods, FEELING_STATE, feelingState } from "../lib/checkin/moodCalendar";

describe("mood calendar from moments", () => {
  it("every feeling word has a calendar colour", () => {
    for (const w of feelingWords) expect(CHECKIN_STATES).toContain(FEELING_STATE[w]);
  });

  it("picks the state most words share, a tie is mixed, unknown words count for nothing", () => {
    expect(feelingState(["calm", "safe", "tired"])).toBe("calm");
    expect(feelingState(["grateful"])).toBe("good");
    expect(feelingState(["calm", "tired"])).toBe("mixed");
    expect(feelingState(["my own word"])).toBeNull();
    expect(feelingState([])).toBeNull();
  });

  it("the How are you answer wins; other days take their moments' feelings, sorted by date", () => {
    const out = calendarMoods(
      [{ date: "2026-11-10", state: "sad" }],
      [
        { date: "2026-11-10", words: ["proud"] },
        { date: "2026-11-11", words: ["tired"] },
        { date: "2026-11-11", words: ["tired", "calm"] },
        { date: "2026-11-09", words: ["anxious"] },
        { date: "2026-11-08", words: [] },
      ],
    );
    expect(out).toEqual([
      { date: "2026-11-09", state: "tense" },
      { date: "2026-11-10", state: "sad" },
      { date: "2026-11-11", state: "tired" },
    ]);
  });
});

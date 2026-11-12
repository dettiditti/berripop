import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { streakOf } from "../lib/progress";
import { claimStreakWelcome, lastSevenDays, streakWelcomeKind } from "../lib/streakWelcome";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";

const TODAY = "2026-11-12"; // a Thursday

describe("daily spark greeting", () => {
  it("celebrates a living spark, welcomes back after a break, and stays quiet for someone with no activity yet", () => {
    expect(streakWelcomeKind(streakOf(new Set(["2026-11-10", "2026-11-11"]), TODAY))).toBe("spark");
    expect(streakWelcomeKind(streakOf(new Set(["2026-11-11"]), TODAY))).toBe("spark");
    // One missed day is a rest day: the spark still lives.
    expect(streakWelcomeKind(streakOf(new Set(["2026-11-10"]), TODAY))).toBe("spark");
    expect(streakWelcomeKind(streakOf(new Set(["2026-11-01"]), TODAY))).toBe("back");
    expect(streakWelcomeKind(streakOf(new Set(), TODAY))).toBeNull();
  });

  it("shows the last seven days ending today with the right weekdays and ticks", () => {
    const week = lastSevenDays(new Set(["2026-11-10", "2026-11-12"]), TODAY);
    expect(week.map(d => d.date)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(week.map(d => d.weekday)).toEqual([5, 6, 0, 1, 2, 3, 4]);
    expect(week.filter(d => d.on).map(d => d.date)).toEqual(["2026-11-10", "2026-11-12"]);
    expect(week.filter(d => d.today).map(d => d.date)).toEqual([TODAY]);
    expect(hu.gamification.streak.welcome.days[week[6].weekday]).toBe("Cs");
    expect(en.gamification.streak.welcome.days[week[6].weekday]).toBe("T");
  });

  describe("once a day per member", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      (globalThis as { window?: unknown }).window = {
        localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      };
    });
    afterEach(() => { delete (globalThis as { window?: unknown }).window; });

    it("shows on the first visit of the day only, separately for each member", () => {
      expect(claimStreakWelcome("u1", TODAY)).toBe(true);
      expect(claimStreakWelcome("u1", TODAY)).toBe(false);
      expect(claimStreakWelcome("u2", TODAY)).toBe(true);
      expect(claimStreakWelcome("u1", "2026-11-13")).toBe(true);
    });

    it("skips the greeting when storage is blocked rather than showing it on every visit", () => {
      (globalThis as { window?: unknown }).window = { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => {} } };
      expect(claimStreakWelcome("u1", TODAY)).toBe(false);
    });
  });
});

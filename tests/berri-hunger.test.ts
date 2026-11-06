import { describe, expect, it } from "vitest";
import { appetiteOf, daysUntil, hungerAfter, lastFedDate } from "../lib/berriHunger";
import { monthGrid, mostOften } from "../lib/checkin/moodCalendar";
import { dictionaries } from "../lib/i18n/dictionaries";

const { reminderText } = await import("../lib/push/reminder");

describe("Berri's appetite", () => {
  const today = "2026-11-06";

  it("is full when fed today, then peckish, hungry, and after a long break just misses you", () => {
    expect(hungerAfter(0)).toBe("full");
    expect(hungerAfter(1)).toBe("peckish");
    expect(hungerAfter(2)).toBe("hungry");
    expect(hungerAfter(3)).toBe("hungry");
    expect(hungerAfter(4)).toBe("missing");
    expect(hungerAfter(40)).toBe("missing");
    expect(hungerAfter(null)).toBe("peckish");
  });

  it("counts days across months and ignores future dates", () => {
    expect(daysUntil("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysUntil(today, today)).toBe(0);
    expect(lastFedDate(["2026-11-01", "2026-11-09", "2026-11-04"], today)).toBe("2026-11-04");
    expect(lastFedDate([], today)).toBeNull();
  });

  it("is fed by questions, check-ins and moments, one bite each per day", () => {
    const a = appetiteOf({ questionDates: [today, "2026-11-01"], checkinDates: [today], momentDates: ["2026-11-05"] }, today);
    expect(a).toEqual({ hunger: "full", mealsToday: ["question", "checkin"], daysSinceFed: 0 });
    const b = appetiteOf({ questionDates: [], checkinDates: [], momentDates: ["2026-11-03"] }, today);
    expect(b.hunger).toBe("hungry");
    expect(b.mealsToday).toEqual([]);
  });

  it("never guilt-trips in the notification, and names nothing personal", () => {
    for (const locale of ["hu", "en"] as const) {
      for (const hunger of ["full", "peckish", "hungry", "missing"] as const) {
        const { title, body } = reminderText(locale, hunger);
        expect(title.length).toBeGreaterThan(0);
        expect(`${title} ${body}`).not.toMatch(/\{|\}|szomor|sad|miattad|because of you/i);
      }
    }
  });

  it("has Berri's texts in every language", () => {
    for (const d of Object.values(dictionaries)) {
      expect(Object.keys(d.berriHome.hunger).sort()).toEqual(["full", "hungry", "missing", "peckish"]);
      expect(d.berriHome.bowl).toContain("{n}");
    }
  });
});

describe("mood calendar", () => {
  it("lays a month out Monday first", () => {
    const nov = monthGrid("2026-11"); // 1 November 2026 is a Sunday
    expect(nov.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(nov.filter(Boolean)).toHaveLength(30);
    expect(monthGrid("2024-01")[0]).toBe("2024-01-01"); // a Monday
  });

  it("finds the most frequent mood of the month only", () => {
    const moods = [
      { date: "2026-10-31", state: "sad" as const },
      { date: "2026-10-30", state: "sad" as const },
      { date: "2026-11-01", state: "calm" as const },
      { date: "2026-11-02", state: "tired" as const },
      { date: "2026-11-03", state: "calm" as const },
    ];
    expect(mostOften(moods, "2026-11")).toBe("calm");
    expect(mostOften(moods, "2026-09")).toBeNull();
  });
});

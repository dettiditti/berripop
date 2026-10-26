import { describe, expect, it } from "vitest";
import { recapTone, weeklyRecap } from "../lib/domain/recap";
import type { View } from "../lib/domain/view";

const TODAY = "2026-10-26";
type Opts = { active?: string[]; journey?: Record<number, string>; answers?: { ref: string; date: string }[]; xp?: { amount: number; date: string }[]; badges?: { id: string; at: string }[] };
const view = ({ active = [], journey = {}, answers = [], xp = [], badges = [] }: Opts) => ({
  today: TODAY,
  circle: null,
  myAnswers: answers.map(a => ({ questionRef: a.ref, date: a.date })) as unknown as View["myAnswers"],
  snapshot: {
    progress: {
      activeDates: active, journey, goalJourney: null, moments: [],
      xp: { total: 0, today: 0, events: xp.map(e => ({ reason: "daily", ref: "x", theme: null, ...e })) },
      achievements: badges.map(b => ({ id: b.id, unlockedAt: b.at })),
    },
  } as unknown as View["snapshot"],
});

describe("weeklyRecap", () => {
  it("covers exactly the last 7 days, today included", () => {
    const r = weeklyRecap(view({ active: ["2026-10-19", "2026-10-20", "2026-10-26"] }));
    expect(r.days.map(d => d.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(r.activeDays).toBe(2);
    expect(r.days[0].active && r.days[6].active).toBe(true);
  });

  it("counts journey stops, XP and badges only inside the week", () => {
    const r = weeklyRecap(view({
      journey: { 1: "2026-10-10", 2: "2026-10-24", 3: "2026-10-25" },
      xp: [{ amount: 10, date: "2026-10-01" }, { amount: 15, date: "2026-10-25" }, { amount: 5, date: "2026-10-26" }],
      badges: [{ id: "first-tiny-step", at: "2026-10-01T10:00:00Z" }, { id: "curious-mind", at: "2026-10-25T10:00:00Z" }],
    }));
    expect(r.journeyStops).toBe(2);
    expect(r.xp).toBe(20);
    expect(r.badges).toEqual(["curious-mind"]);
  });

  it("counts each question once and finds no theme without answers", () => {
    expect(weeklyRecap(view({})).topTheme).toBeNull();
    expect(weeklyRecap(view({})).answers).toBe(0);
  });

  it("picks a tone from the number of active days", () => {
    expect([0, 1, 2, 3, 5, 6, 7].map(recapTone)).toEqual(["quiet", "start", "start", "steady", "steady", "strong", "strong"]);
  });
});

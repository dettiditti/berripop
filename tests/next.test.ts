import { describe, expect, it } from "vitest";
import { assessmentOpen, pathStartsToday, recommendNext } from "../lib/domain/next";
import { journeyStateFor } from "../lib/domain/rules";
import { goalNodes } from "../lib/journey/goal";
import type { View } from "../lib/domain/view";

const TODAY = "2026-10-26";
const YESTERDAY = "2026-10-25";
const done = (n: number, date = YESTERDAY) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, date]));

// A goal journey built at local noon on the given day (local time, like the app).
const builtOn = (day: string) => new Date(`${day}T12:00:00`).toISOString();

type Args = { daily?: boolean; dailyDone?: boolean; circle?: boolean; journey?: Record<number, string>; goal?: Record<number, string> | null; answered?: number; builtOnDay?: string };
const view = ({ daily = true, dailyDone = false, circle = false, journey = {}, goal = null, answered = 3, builtOnDay = YESTERDAY }: Args = {}) => ({
  today: TODAY,
  facts: { answered },
  circle: circle ? ({ id: "c" } as unknown as View["circle"]) : null,
  dailyRef: daily ? "q:1" : null,
  dailyDoneByMe: dailyDone,
  goalJourney: goal ? ({ id: "g", done: goal, createdAt: builtOn(builtOnDay) } as unknown as View["goalJourney"]) : null,
  goalState: goal ? journeyStateFor(goal, TODAY, goalNodes) : null,
  journey: journeyStateFor(journey, TODAY),
});

describe("assessmentOpen", () => {
  it("is open without a circle until accepted or skipped", () => {
    expect(assessmentOpen(false, null)).toBe(true);
    expect(assessmentOpen(false, "in_progress")).toBe(true);
    expect(assessmentOpen(false, "ready")).toBe(true);
    expect(assessmentOpen(false, "accepted")).toBe(false);
    expect(assessmentOpen(false, "skipped")).toBe(false);
    expect(assessmentOpen(true, null)).toBe(false);
  });
});

describe("recommendNext", () => {
  it("puts the short daily question first for a member who has been here before, even before the assessment", () => {
    expect(recommendNext(view(), null, false)).toEqual({ kind: "daily" });
  });

  it("then offers the assessment, resuming one under way", () => {
    expect(recommendNext(view({ dailyDone: true }), null, false)).toEqual({ kind: "assessment", resume: false });
    expect(recommendNext(view({ dailyDone: true }), "in_progress", false)).toEqual({ kind: "assessment", resume: true });
  });

  it("shows the journey being built after accepting", () => {
    expect(recommendNext(view({ dailyDone: true }), "accepted", true)).toEqual({ kind: "building" });
  });

  it("recommends today's goal journey stop", () => {
    expect(recommendNext(view({ dailyDone: true, goal: done(2) }), "accepted", false)).toEqual({ kind: "goal", day: 3 });
  });

  it("does not offer the built-in journey to a member walking a goal journey alone", () => {
    expect(recommendNext(view({ dailyDone: true, goal: { 1: TODAY } }), "accepted", false)).toEqual({ kind: "rest" });
  });

  it("recommends the built-in journey without a goal journey, and the shared one in a circle", () => {
    expect(recommendNext(view({ dailyDone: true, journey: done(4) }), "skipped", false)).toEqual({ kind: "journey", day: 5 });
    expect(recommendNext(view({ dailyDone: true, circle: true, goal: { 1: TODAY } }), null, false)).toEqual({ kind: "journey", day: 1 });
  });

  it("rests once today's stop is done (one stop a day)", () => {
    expect(recommendNext(view({ dailyDone: true, journey: { ...done(4), 5: TODAY } }), "skipped", false)).toEqual({ kind: "rest" });
  });

  it("continues into the next chapter after day 21, and rests once all 63 days are done", () => {
    expect(recommendNext(view({ dailyDone: true, journey: done(21) }), "skipped", false)).toEqual({ kind: "journey", day: 22 });
    expect(recommendNext(view({ dailyDone: true, journey: done(63) }), "skipped", false)).toEqual({ kind: "rest" });
  });

  it("rests when a goal journey is complete (its next chapter is offered on the journey screen)", () => {
    expect(recommendNext(view({ dailyDone: true, goal: done(21) }), "accepted", false)).toEqual({ kind: "rest" });
  });

  it("skips the daily step when there is no daily question", () => {
    expect(recommendNext(view({ daily: false, circle: true }), null, false)).toEqual({ kind: "journey", day: 1 });
  });
});

describe("the day the member's own path begins: one thing to do, not two", () => {
  const fresh = (args: Args = {}) => view({ answered: 0, ...args });

  it("sends a new member straight to the assessment, not the daily question", () => {
    expect(recommendNext(fresh(), null, false)).toEqual({ kind: "assessment", resume: false });
    expect(recommendNext(fresh(), "in_progress", false)).toEqual({ kind: "assessment", resume: true });
  });

  it("then shows the journey being built, then its first day", () => {
    expect(recommendNext(fresh(), "accepted", true)).toEqual({ kind: "building" });
    expect(recommendNext(fresh({ goal: {}, builtOnDay: TODAY }), "accepted", false)).toEqual({ kind: "goal", day: 1 });
  });

  it("rests once the first day is done, instead of asking the daily question too", () => {
    expect(recommendNext(view({ goal: { 1: TODAY }, builtOnDay: TODAY }), "accepted", false)).toEqual({ kind: "rest" });
  });

  it("asks the daily question again from the next day", () => {
    expect(recommendNext(view({ goal: { 1: YESTERDAY }, builtOnDay: YESTERDAY }), "accepted", false)).toEqual({ kind: "daily" });
  });

  it("keeps the daily question first for a new member who skipped the assessment or is in a circle", () => {
    expect(recommendNext(fresh(), "skipped", false)).toEqual({ kind: "daily" });
    expect(recommendNext(fresh({ circle: true }), null, false)).toEqual({ kind: "daily" });
  });

  it("knows when the path begins", () => {
    expect(pathStartsToday(fresh(), null)).toBe(true);
    expect(pathStartsToday(view(), null)).toBe(false);
    expect(pathStartsToday(view({ goal: {}, builtOnDay: TODAY }), "accepted")).toBe(true);
    expect(pathStartsToday(view({ goal: {}, builtOnDay: YESTERDAY }), "accepted")).toBe(false);
  });
});

describe("recommendNext without a daily question", () => {
  it("goes on to the journey", () => {
    expect(recommendNext(view({ daily: false, circle: true }), null, false)).toEqual({ kind: "journey", day: 1 });
  });
});

describe("before the assessment state has loaded", () => {
  it("does not offer the assessment to a member already walking a goal journey", () => {
    expect(recommendNext(view({ dailyDone: true, goal: done(2) }), undefined, false)).toEqual({ kind: "goal", day: 3 });
  });

  it("still offers it to a member without a path yet", () => {
    expect(recommendNext(view({ dailyDone: true }), undefined, false)).toEqual({ kind: "assessment", resume: false });
  });
});

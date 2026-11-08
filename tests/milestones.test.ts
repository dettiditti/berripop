import { describe, expect, it } from "vitest";
import { MILESTONE_COPY, milestonesFrom, nextMilestone, type MilestoneCounts } from "@/lib/milestones";
import { freshlyReached } from "@/lib/celebrate";

const zero: MilestoneCounts = {
  entries: 0, stickered: 0, feelings: 0, reflections: 0, insights: 0, circles: 0,
  circleAnswers: 0, reactions: 0, goals: 0, stepsDone: 0, goalDays: 0,
};

describe("milestonesFrom", () => {
  it("lists all 17 with nothing done for a new member", () => {
    const all = milestonesFrom(zero, 0);
    expect(all).toHaveLength(17);
    expect(all.every(m => !m.done && m.have === 0)).toBe(true);
  });

  it("hides the sticker milestones while feelings are unavailable", () => {
    const ids = milestonesFrom({ ...zero, stickered: null, feelings: null }, 0).map(m => m.id);
    expect(ids).not.toContain("first-sticker");
    expect(ids).not.toContain("all-feelings");
    expect(ids).toHaveLength(15);
  });

  it("caps progress at the target and marks it done", () => {
    const e = milestonesFrom({ ...zero, entries: 73 }, 0);
    expect(e.find(m => m.id === "entries-50")).toMatchObject({ have: 50, need: 50, done: true });
    expect(e.find(m => m.id === "first-entry")?.done).toBe(true);
  });

  it("counts streaks from the best streak", () => {
    const s = milestonesFrom(zero, 8);
    expect(s.find(m => m.id === "streak-7")?.done).toBe(true);
    expect(s.find(m => m.id === "streak-30")).toMatchObject({ have: 8, done: false });
  });

  it("has copy for every milestone in both languages", () => {
    for (const m of milestonesFrom(zero, 0)) {
      expect(MILESTONE_COPY.hu.items[m.id].label).toBeTruthy();
      expect(MILESTONE_COPY.en.items[m.id].label).toBeTruthy();
    }
  });
});

describe("nextMilestone", () => {
  it("picks the unfinished one closest to done", () => {
    const next = nextMilestone(milestonesFrom({ ...zero, entries: 8 }, 0));
    expect(next?.id).toBe("entries-10");
  });
  it("is null when everything is done", () => {
    const big: MilestoneCounts = { entries: 99, stickered: 9, feelings: 7, reflections: 20, insights: 3, circles: 1, circleAnswers: 5, reactions: 9, goals: 2, stepsDone: 4, goalDays: 9 };
    expect(nextMilestone(milestonesFrom(big, 40))).toBeNull();
  });
});

describe("freshlyReached", () => {
  it("takes the first list on a device as a silent baseline", () => {
    expect(freshlyReached(null, ["a", "b"])).toEqual({ fresh: [], next: ["a", "b"] });
  });
  it("returns only what is new, once", () => {
    const first = freshlyReached(["a"], ["a", "b", "b"]);
    expect(first).toEqual({ fresh: ["b"], next: ["a", "b"] });
    expect(freshlyReached(first.next, ["a", "b"]).fresh).toEqual([]);
  });
  it("keeps celebrated ids even if they drop out later", () => {
    expect(freshlyReached(["a", "b"], ["a"])).toEqual({ fresh: [], next: ["a", "b"] });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADVENT_DAYS, ADVENT_GIFTS, adventActive, adventDay, adventStars, canOpen, giftedItems, nextWindow, windowState } from "../lib/advent";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";
import { starsSpent, wardrobeOf, inSeason } from "../lib/wardrobe";

const none = new Set<number>();

describe("advent calendar days", () => {
  it("is on only in December (Budapest date)", () => {
    expect(adventDay("2026-12-07")).toEqual({ year: 2026, day: 7 });
    expect(adventDay("2026-11-30")).toBeNull();
    expect(adventDay("2027-01-01")).toBeNull();
    expect(adventActive("2026-12-31")).toBe(true);
  });

  it("today's window is open, earlier ones missed, later ones locked", () => {
    expect(windowState(7, "2026-12-07", none)).toBe("open");
    expect(windowState(3, "2026-12-07", none)).toBe("missed");
    expect(windowState(8, "2026-12-07", none)).toBe("locked");
    expect(windowState(3, "2026-12-07", new Set([3]))).toBe("opened");
  });

  it("only today's or a missed window can be opened, never a later one or a 25th", () => {
    expect(canOpen(7, "2026-12-07", none)).toBe(true);
    expect(canOpen(1, "2026-12-07", none)).toBe(true);
    expect(canOpen(8, "2026-12-07", none)).toBe(false);
    expect(canOpen(7, "2026-12-07", new Set([7]))).toBe(false);
    expect(canOpen(25, "2026-12-28", none)).toBe(false);
    expect(canOpen(1.5, "2026-12-07", none)).toBe(false);
    expect(canOpen(5, "2026-11-30", none)).toBe(false);
  });

  it("missed windows stay openable until 31 December", () => {
    expect(canOpen(10, "2026-12-31", none)).toBe(true);
    expect(nextWindow("2026-12-31", new Set([1, 2]))).toBe(3);
  });

  it("the card offers today's window first, then the earliest missed one", () => {
    expect(nextWindow("2026-12-07", none)).toBe(7);
    expect(nextWindow("2026-12-07", new Set([7]))).toBe(1);
    const all = new Set(Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1));
    expect(nextWindow("2026-12-26", all)).toBeNull();
    expect(nextWindow("2026-11-20", none)).toBeNull();
  });
});

describe("advent stars and gifts", () => {
  it("a star per window, five more instead of a gift already owned", () => {
    expect(adventStars([{ day: 1, gift: null }, { day: 6, gift: "snowfall" }, { day: 13, gift: "stars" }])).toBe(1 + 1 + 6);
  });

  it("gifted things are not paid for with stars", () => {
    const opened = [{ day: 6, gift: "snowfall" }, { day: 13, gift: "stars" }];
    expect(giftedItems(opened)).toEqual(["snowfall"]);
    expect(starsSpent(["snowfall"], giftedItems(opened))).toBe(0);
    expect(starsSpent(["snowfall"])).toBeGreaterThan(0);
    const w = wardrobeOf(2, [{ itemId: "snowfall", equipped: true }], ["snowfall"]);
    expect(w.balance).toBe(2);
  });

  it("every gift is a winter thing that can be out in December", () => {
    for (const item of Object.values(ADVENT_GIFTS)) expect(inSeason(item!, "2026-12-10")).toBe(true);
  });
});

describe("advent copy", () => {
  it("24 windows in both languages", () => {
    expect(hu.advent.windows).toHaveLength(ADVENT_DAYS);
    expect(en.advent.windows).toHaveLength(ADVENT_DAYS);
  });

  it("the server keeps only window numbers and gift ids, never what the member writes", () => {
    const src = readFileSync("lib/server/advent.ts", "utf8");
    for (const table of ["journalEntries", "answers", "dailyCheckins", "worldMoments"]) expect(src).not.toMatch(new RegExp(`\\b${table}\\b`));
    expect(src).toContain('track(userId, "advent_window_opened")');
  });
});

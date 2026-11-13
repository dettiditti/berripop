import { describe, expect, it } from "vitest";
import { canBuy, DRESSING_ENABLED, HEAD_ITEMS, inSeason, isOffered, ITEM_SEASON, PRICES, seasonOf, starsEarned, wardrobeOf, wornHeadItem } from "../lib/wardrobe";

const DAY = "2026-11-13";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";

describe("Berri's treasure chest", () => {
  it("earns one star per day for each kind of food, so at most three a day", () => {
    expect(starsEarned({ questionDates: ["2026-11-10", "2026-11-10", "2026-11-11"], checkinDates: ["2026-11-11"], momentDates: [] })).toBe(3);
    expect(starsEarned({ questionDates: [], checkinDates: [], momentDates: [] })).toBe(0);
  });

  it("subtracts what the member picked and ignores unknown rows", () => {
    const w = wardrobeOf(40, [{ itemId: "bench", equipped: true }, { itemId: "capblue", equipped: true }, { itemId: "gone", equipped: true }]);
    expect(w.spent).toBe(PRICES.bench + PRICES.capblue);
    expect(w.balance).toBe(40 - 16);
    expect(w.owned).toEqual(["bench", "capblue"]);
    expect(wornHeadItem(w)).toBe(DRESSING_ENABLED ? "capblue" : null);
    expect(wardrobeOf(3, [{ itemId: "rainbow", equipped: false }]).balance).toBe(0);
  });

  it("lets the member pick only real things they do not have yet and have enough stars for", () => {
    const w = wardrobeOf(12, [{ itemId: "bench", equipped: false }]);
    expect(canBuy(w, "rainbow", DAY)).toEqual({ ok: false, reason: "stars" });
    expect(canBuy(w, "bench", DAY)).toEqual({ ok: false, reason: "owned" });
    expect(canBuy(w, "jetpack", DAY)).toEqual({ ok: false, reason: "unknown" });
    expect(canBuy(wardrobeOf(16, [{ itemId: "bench", equipped: false }]), "sunflowers", DAY)).toEqual({ ok: true });
  });

  it("offers no hats while dressing Berri is switched off", () => {
    for (const id of HEAD_ITEMS) {
      expect(isOffered(id, DAY)).toBe(DRESSING_ENABLED);
      if (!DRESSING_ENABLED) expect(canBuy(wardrobeOf(99, []), id, DAY)).toEqual({ ok: false, reason: "unknown" });
    }
  });

  it("tells the seasons apart, with winter from November to February", () => {
    expect(seasonOf("2026-11-01")).toBe("winter");
    expect(seasonOf("2026-12-24")).toBe("winter");
    expect(seasonOf("2027-02-28")).toBe("winter");
    expect(seasonOf("2027-03-01")).toBe("spring");
    expect(seasonOf("2027-07-10")).toBe("summer");
    expect(seasonOf("2026-10-31")).toBe("autumn");
  });

  it("offers the winter things only in winter, and keeps them for whoever has one", () => {
    const winter = Object.keys(ITEM_SEASON) as (keyof typeof ITEM_SEASON)[];
    expect(winter).toEqual(expect.arrayContaining(["snowfall", "sled", "snowman", "firtree"]));
    for (const id of winter) {
      expect(isOffered(id, "2026-12-10")).toBe(true);
      expect(isOffered(id, "2027-06-10")).toBe(false);
      expect(canBuy(wardrobeOf(99, []), id, "2026-12-10")).toEqual({ ok: true });
      expect(canBuy(wardrobeOf(99, []), id, "2027-06-10")).toEqual({ ok: false, reason: "unknown" });
    }
    // Everyday things are always in season; a kept snowman still counts as spent stars.
    expect(inSeason("bench", "2027-06-10")).toBe(true);
    expect(wardrobeOf(40, [{ itemId: "snowman", equipped: true }]).spent).toBe(PRICES.snowman);
  });

  it("names every thing in both languages", () => {
    for (const id of Object.keys(PRICES)) {
      expect(hu.wardrobe.items[id as keyof typeof PRICES]).toBeTruthy();
      expect(en.wardrobe.items[id as keyof typeof PRICES]).toBeTruthy();
    }
  });
});

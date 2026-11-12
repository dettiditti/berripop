import { describe, expect, it } from "vitest";
import { canBuy, PRICES, starsEarned, wardrobeOf, wornHeadItem } from "../lib/wardrobe";
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
    expect(wornHeadItem(w)).toBe("capblue");
    expect(wardrobeOf(3, [{ itemId: "rainbow", equipped: false }]).balance).toBe(0);
  });

  it("lets the member pick only real things they do not have yet and have enough stars for", () => {
    const w = wardrobeOf(12, [{ itemId: "bench", equipped: false }]);
    expect(canBuy(w, "capblue")).toEqual({ ok: false, reason: "stars" });
    expect(canBuy(w, "bench")).toEqual({ ok: false, reason: "owned" });
    expect(canBuy(w, "jetpack")).toEqual({ ok: false, reason: "unknown" });
    expect(canBuy(wardrobeOf(16, [{ itemId: "bench", equipped: false }]), "capblue")).toEqual({ ok: true });
  });

  it("names every thing in both languages", () => {
    for (const id of Object.keys(PRICES)) {
      expect(hu.wardrobe.items[id as keyof typeof PRICES]).toBeTruthy();
      expect(en.wardrobe.items[id as keyof typeof PRICES]).toBeTruthy();
    }
  });
});

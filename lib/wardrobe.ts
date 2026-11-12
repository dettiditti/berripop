/*
 * Berri's treasure chest: stars the member collects by feeding Berri, and the
 * little things they can pick with them (something for Berri to wear, things
 * for Berri's world). Stars are never sold and nothing here costs money: they
 * only come from taking part, one per kind of "food" a day (a question, a
 * check-in, a moment), so at most three a day. Shared by the server (which
 * decides) and the app (which shows).
 */

export type ItemKind = "head" | "world";

export const HEAD_ITEMS = ["capblue", "cappink", "beanie", "cowboy", "aviator"] as const;
export const WORLD_ITEMS = ["bench", "sunflowers", "birdhouse", "swing", "lights", "mushroom", "rainbow"] as const;
export type HeadItemId = (typeof HEAD_ITEMS)[number];
export type WorldItemId = (typeof WORLD_ITEMS)[number];
export type ItemId = HeadItemId | WorldItemId;

/** Price in stars. A member who feeds Berri most days gets the first thing within a few days. */
export const PRICES: Record<ItemId, number> = {
  capblue: 10, cappink: 10, beanie: 15, cowboy: 22, aviator: 30,
  bench: 6, sunflowers: 10, birdhouse: 12, swing: 15, lights: 18, mushroom: 22, rainbow: 30,
};

/** Things for Berri to wear, each with its own picture in public/berri/wear; a head item is offered only when listed here. */
export const WEAR_READY: Record<HeadItemId, boolean> = { capblue: true, cappink: true, beanie: true, cowboy: true, aviator: true };

export const isHeadItem = (id: string): id is HeadItemId => (HEAD_ITEMS as readonly string[]).includes(id);
export const isWorldItem = (id: string): id is WorldItemId => (WORLD_ITEMS as readonly string[]).includes(id);
export const isItem = (id: string): id is ItemId => isHeadItem(id) || isWorldItem(id);
export const kindOf = (id: ItemId): ItemKind => (isHeadItem(id) ? "head" : "world");
/** Offered in the chest right now. */
export const isOffered = (id: ItemId) => !isHeadItem(id) || WEAR_READY[id];

/** Stars earned: one for each day with each kind of food (question, check-in, moment). */
export function starsEarned(input: { questionDates: Iterable<string>; checkinDates: Iterable<string>; momentDates: Iterable<string> }): number {
  return new Set(input.questionDates).size + new Set(input.checkinDates).size + new Set(input.momentDates).size;
}

export function starsSpent(owned: Iterable<string>): number {
  let n = 0;
  for (const id of owned) if (isItem(id)) n += PRICES[id];
  return n;
}

export type WardrobeDTO = {
  earned: number;
  spent: number;
  balance: number;
  owned: ItemId[];
  /** What Berri wears (at most one head item) and which world things are out. */
  equipped: ItemId[];
};

export function wardrobeOf(earned: number, rows: { itemId: string; equipped: boolean }[]): WardrobeDTO {
  const valid = rows.filter(r => isItem(r.itemId));
  const owned = valid.map(r => r.itemId as ItemId);
  const spent = starsSpent(owned);
  return { earned, spent, balance: Math.max(0, earned - spent), owned, equipped: valid.filter(r => r.equipped).map(r => r.itemId as ItemId) };
}

export type BuyCheck = { ok: true } | { ok: false; reason: "unknown" | "owned" | "stars" };

export function canBuy(w: WardrobeDTO, id: string): BuyCheck {
  if (!isItem(id) || !isOffered(id)) return { ok: false, reason: "unknown" };
  if (w.owned.includes(id)) return { ok: false, reason: "owned" };
  if (w.earned - w.spent < PRICES[id]) return { ok: false, reason: "stars" };
  return { ok: true };
}

/** The head item Berri wears, if any. */
export function wornHeadItem(w: Pick<WardrobeDTO, "equipped"> | null | undefined): HeadItemId | null {
  return (w?.equipped.find(isHeadItem) as HeadItemId | undefined) ?? null;
}

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adventStars, giftedItems } from "../advent";
import { adventWindows, berriItems, dailyCheckins, userActivity, userXpEvents, worldMoments } from "../db/schema";
import { starsEarned, wardrobeOf, type WardrobeDTO } from "../wardrobe";

/**
 * The member's stars and what they picked with them, counted from their own
 * records: activity days (as for Berri's "question" food), check-in days and
 * moment days, plus the advent calendar's windows. Only dates are read,
 * never any content. Advent gifts are owned without costing stars.
 */
export async function loadWardrobe(userId: string): Promise<WardrobeDTO> {
  const db = getDb();
  const [activity, xp, checkins, moments, items, advent] = await Promise.all([
    db.selectDistinct({ date: userActivity.date }).from(userActivity).where(eq(userActivity.userId, userId)),
    db.selectDistinct({ date: userXpEvents.date }).from(userXpEvents).where(eq(userXpEvents.userId, userId)),
    db.selectDistinct({ date: dailyCheckins.date }).from(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.selectDistinct({ date: worldMoments.date }).from(worldMoments).where(eq(worldMoments.userId, userId)),
    db.select({ itemId: berriItems.itemId, equipped: berriItems.equipped }).from(berriItems).where(eq(berriItems.userId, userId)),
    db.select({ day: adventWindows.day, gift: adventWindows.gift }).from(adventWindows).where(eq(adventWindows.userId, userId)),
  ]);
  const earned = starsEarned({
    questionDates: [...activity, ...xp].map(r => r.date),
    checkinDates: checkins.map(r => r.date),
    momentDates: moments.map(r => r.date),
  }) + adventStars(advent);
  return wardrobeOf(earned, items, giftedItems(advent));
}

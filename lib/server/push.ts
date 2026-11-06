import "server-only";
import { and, eq, inArray, max } from "drizzle-orm";
import { getDb } from "../db";
import { daysUntil, hungerAfter, lastFedDate, type Hunger } from "../berriHunger";
import { dailyCheckins, pushDevices, userActivity, userPrefs, worldMoments } from "../db/schema";
import { circleToday } from "../domain/rules";
import { isLocale } from "../i18n/config";
import { apnsConfig, isDeadToken, sendAlerts } from "../push/apns";
import { devicesToRemind, isDeviceToken, reminderText } from "../push/reminder";

/** Turns the daily reminder on for this phone (or refreshes its token). */
export async function savePushDevice(userId: string, token: unknown): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  await getDb().insert(pushDevices).values({ token, userId })
    .onConflictDoUpdate({ target: pushDevices.token, set: { userId, updatedAt: new Date() } });
  return true;
}

/** Turns the daily reminder off for this phone. */
export async function removePushDevice(userId: string, token: unknown): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  await getDb().delete(pushDevices).where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)));
  return true;
}

export async function hasPushDevice(userId: string, token: unknown): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  const rows = await getDb().select({ token: pushDevices.token }).from(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId))).limit(1);
  return rows.length > 0;
}

/**
 * The daily reminder (cron): to every phone that asked for it, unless the
 * member already did today's step. Does nothing until APNs is configured.
 * Returns counts only.
 */
export async function sendDailyReminders(now = new Date()): Promise<{ configured: boolean; due: number; sent: number; removed: number }> {
  const config = apnsConfig();
  if (!config) return { configured: false, due: 0, sent: 0, removed: 0 };
  const db = getDb();
  const today = circleToday(now);
  const devices = await db.select({ token: pushDevices.token, userId: pushDevices.userId, lastSentDate: pushDevices.lastSentDate, locale: userPrefs.locale })
    .from(pushDevices).leftJoin(userPrefs, eq(userPrefs.userId, pushDevices.userId));
  if (!devices.length) return { configured: true, due: 0, sent: 0, removed: 0 };
  const userIds = [...new Set(devices.map(d => d.userId))];
  // When each member last fed Berri: a completed question, a check-in or a saved moment (dates only, no content).
  const [acts, checks, moments] = await Promise.all([
    db.select({ userId: userActivity.userId, last: max(userActivity.date) }).from(userActivity).where(inArray(userActivity.userId, userIds)).groupBy(userActivity.userId),
    db.select({ userId: dailyCheckins.userId, last: max(dailyCheckins.date) }).from(dailyCheckins).where(inArray(dailyCheckins.userId, userIds)).groupBy(dailyCheckins.userId),
    db.select({ userId: worldMoments.userId, last: max(worldMoments.date) }).from(worldMoments).where(inArray(worldMoments.userId, userIds)).groupBy(worldMoments.userId),
  ]);
  const lastFed = new Map<string, string>();
  for (const r of [...acts, ...checks, ...moments]) {
    const last = r.last ? lastFedDate([r.last, lastFed.get(r.userId) ?? r.last], today) : null;
    if (last) lastFed.set(r.userId, last);
  }
  const hungerOf = (userId: string): Hunger => {
    const last = lastFed.get(userId);
    return hungerAfter(last ? daysUntil(last, today) : null);
  };
  const fedToday = new Set([...lastFed].filter(([, d]) => d === today).map(([u]) => u));
  const due = devicesToRemind(devices, fedToday, today);

  const localeOf = new Map(devices.map(d => [d.token, isLocale(d.locale) ? d.locale : "hu"]));
  let sent = 0;
  const dead: string[] = [];
  for (const locale of ["hu", "en"] as const) {
    for (const hunger of ["full", "peckish", "hungry", "missing"] as const) {
      const group = due.filter(d => localeOf.get(d.token) === locale && hungerOf(d.userId) === hunger);
      if (!group.length) continue;
      const results = await sendAlerts(config, group.map(d => d.token), reminderText(locale, hunger));
      const ok = results.filter(r => r.ok).map(r => r.token);
      sent += ok.length;
      dead.push(...results.filter(isDeadToken).map(r => r.token));
      if (ok.length) await db.update(pushDevices).set({ lastSentDate: today }).where(inArray(pushDevices.token, ok));
    }
  }
  if (dead.length) await db.delete(pushDevices).where(inArray(pushDevices.token, dead));
  return { configured: true, due: due.length, sent, removed: dead.length };
}

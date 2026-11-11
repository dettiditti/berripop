import "server-only";
import { and, eq, gte, inArray, lt, max, ne, sql } from "drizzle-orm";
import { AREAS, type Area } from "../assessment/model";
import { isCheckinState, type CheckinState } from "../checkin/checkin";
import { getDb } from "../db";
import {
  answers, dailyCheckins, growthSteps, journalEntries, pathAssessments, pushDevices, pushSends, userActivity, userPrefs, worldMoments,
} from "../db/schema";
import { apnsConfig, sendAlerts } from "../push/apns";
import { runPushJob, type PushRunResult, type PushStore } from "../push/job";
import { isDeviceToken } from "../push/reminder";
import { cleanPrefs, cleanTimeZone, type PushPrefs } from "../push/schedule";

/*
 * Privacy rule for this file: the notification job reads only that something
 * happened and when (timestamps), the member's picked interest areas, and the
 * mood word of a recent check-in. It never selects a journal body, an AI
 * reflection, an answer's text, a check-in note or any other written content.
 * tests/push.test.ts checks this file for it.
 */

/** Turns notifications on for this phone (or refreshes its token and time zone). */
export async function savePushDevice(userId: string, token: unknown, timeZone?: unknown): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  const tz = cleanTimeZone(timeZone);
  await getDb().insert(pushDevices).values({ token, userId, timeZone: tz })
    .onConflictDoUpdate({ target: pushDevices.token, set: { userId, timeZone: tz, updatedAt: new Date() } });
  return true;
}

/** Keeps an already registered phone's time zone current (after travel); never registers one. */
export async function refreshPushTimeZone(userId: string, token: unknown, timeZone: unknown): Promise<void> {
  if (!isDeviceToken(token) || typeof timeZone !== "string") return;
  const tz = cleanTimeZone(timeZone);
  if (tz !== timeZone) return;
  await getDb().update(pushDevices).set({ timeZone: tz, updatedAt: new Date() })
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId), ne(pushDevices.timeZone, tz)));
}

/** This phone's notification choices, or null when notifications are off on it. */
export async function getPushPrefs(userId: string, token: unknown): Promise<PushPrefs | null> {
  if (!isDeviceToken(token)) return null;
  const [row] = await getDb().select({
    remind: pushDevices.remind, remindHour: pushDevices.remindHour, thought: pushDevices.thought, thoughtHour: pushDevices.thoughtHour, personalize: pushDevices.personalize,
  }).from(pushDevices).where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId))).limit(1);
  return row ? cleanPrefs(row) : null;
}

/**
 * Changes which notifications this phone gets and when. Unknown values keep
 * what was saved. A kind already sent today is not sent again today, even if
 * the new hour is later (push_sends).
 */
export async function setPushPrefs(userId: string, token: unknown, patch: unknown): Promise<PushPrefs | null> {
  const current = await getPushPrefs(userId, token);
  if (!current || !isDeviceToken(token)) return null;
  const next = cleanPrefs(patch, current);
  await getDb().update(pushDevices).set({ ...next, updatedAt: new Date() })
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)));
  return next;
}

/**
 * Turns notifications off for this phone. The send log (push_sends) stays for
 * its few days, so switching off and on again cannot repeat today's ones.
 */
export async function removePushDevice(userId: string, token: unknown): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  await getDb().delete(pushDevices).where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)));
  return true;
}

/** A check-in this recent still says something about the member's mood this morning. */
const MOOD_MS = 36 * 3600_000;

/**
 * When each member last did something in the app: a daily question or step,
 * a check-in, a saved journal entry, a circle answer, a path step or a world
 * moment. Timestamps only, never content.
 */
async function lastActivity(userIds: string[], since: Date): Promise<Map<string, Date>> {
  const db = getDb();
  const rows = (await Promise.all([
    db.select({ userId: userActivity.userId, at: max(userActivity.completedAt) }).from(userActivity)
      .where(and(inArray(userActivity.userId, userIds), gte(userActivity.completedAt, since))).groupBy(userActivity.userId),
    db.select({ userId: dailyCheckins.userId, at: max(dailyCheckins.updatedAt) }).from(dailyCheckins)
      .where(and(inArray(dailyCheckins.userId, userIds), gte(dailyCheckins.updatedAt, since))).groupBy(dailyCheckins.userId),
    db.select({ userId: journalEntries.userId, at: max(journalEntries.updatedAt) }).from(journalEntries)
      .where(and(inArray(journalEntries.userId, userIds), eq(journalEntries.status, "saved"), gte(journalEntries.updatedAt, since))).groupBy(journalEntries.userId),
    db.select({ userId: answers.userId, at: max(answers.updatedAt) }).from(answers)
      .where(and(inArray(answers.userId, userIds), gte(answers.updatedAt, since))).groupBy(answers.userId),
    db.select({ userId: growthSteps.userId, at: max(growthSteps.doneAt) }).from(growthSteps)
      .where(and(inArray(growthSteps.userId, userIds), gte(growthSteps.doneAt, since))).groupBy(growthSteps.userId),
    db.select({ userId: worldMoments.userId, at: max(worldMoments.createdAt) }).from(worldMoments)
      .where(and(inArray(worldMoments.userId, userIds), gte(worldMoments.createdAt, since))).groupBy(worldMoments.userId),
  ])).flat();
  const last = new Map<string, Date>();
  for (const r of rows) {
    if (!r.at) continue;
    const at = new Date(r.at);
    const prev = last.get(r.userId);
    if (!prev || at > prev) last.set(r.userId, at);
  }
  return last;
}

/**
 * The only inputs a personal thought may use: the interest areas picked in the
 * start questions (read inside the database, so the assessment's free-text
 * answers never leave it) and the mood word of a recent check-in.
 */
async function thoughtInputs(userIds: string[], now: Date): Promise<{ areas: Map<string, Area[]>; moods: Map<string, CheckinState> }> {
  const db = getDb();
  const [areaRows, moodRows] = await Promise.all([
    db.select({ userId: pathAssessments.userId, areas: sql<unknown>`${pathAssessments.answers} -> 'areas'`, area: sql<unknown>`${pathAssessments.answers} ->> 'area'` })
      .from(pathAssessments).where(inArray(pathAssessments.userId, userIds)),
    db.select({ userId: dailyCheckins.userId, state: dailyCheckins.state, at: dailyCheckins.updatedAt }).from(dailyCheckins)
      .where(and(inArray(dailyCheckins.userId, userIds), gte(dailyCheckins.updatedAt, new Date(now.getTime() - MOOD_MS)))),
  ]);
  const isArea = (v: unknown): v is Area => typeof v === "string" && (AREAS as readonly string[]).includes(v);
  const areas = new Map<string, Area[]>();
  for (const r of areaRows) {
    const list = Array.isArray(r.areas) ? r.areas.filter(isArea) : isArea(r.area) ? [r.area] : [];
    if (list.length) areas.set(r.userId, list);
  }
  const moods = new Map<string, CheckinState>();
  const latest = new Map<string, number>();
  for (const r of moodRows) {
    if (!isCheckinState(r.state)) continue;
    const at = new Date(r.at).getTime();
    if ((latest.get(r.userId) ?? 0) < at) { latest.set(r.userId, at); moods.set(r.userId, r.state); }
  }
  return { areas, moods };
}

/** The database side of the job (lib/push/job). */
const dbStore: PushStore = {
  async pruneSends(before) {
    await getDb().delete(pushSends).where(lt(pushSends.sentAt, before));
  },
  async devices() {
    return getDb().select({
      token: pushDevices.token, userId: pushDevices.userId, timeZone: pushDevices.timeZone,
      remind: pushDevices.remind, remindHour: pushDevices.remindHour, thought: pushDevices.thought, thoughtHour: pushDevices.thoughtHour,
      personalize: pushDevices.personalize, locale: userPrefs.locale,
    }).from(pushDevices).leftJoin(userPrefs, eq(userPrefs.userId, pushDevices.userId));
  },
  lastActivity,
  async sends(userIds) {
    return getDb().select({ userId: pushSends.userId, kind: pushSends.kind, date: pushSends.date, sentAt: pushSends.sentAt }).from(pushSends).where(inArray(pushSends.userId, userIds));
  },
  thoughtInputs,
  async claim(userId, kind, date) {
    const rows = await getDb().insert(pushSends).values({ userId, kind, date }).onConflictDoNothing().returning({ userId: pushSends.userId });
    return rows.length > 0;
  },
  async release(userId, kind, date) {
    await getDb().delete(pushSends).where(and(eq(pushSends.userId, userId), eq(pushSends.kind, kind), eq(pushSends.date, date)));
  },
  async markReminded(tokens, date) {
    if (tokens.length) await getDb().update(pushDevices).set({ lastSentDate: date }).where(inArray(pushDevices.token, tokens));
  },
  async removeDevices(tokens) {
    if (tokens.length) await getDb().delete(pushDevices).where(inArray(pushDevices.token, tokens));
  },
};

/**
 * The hourly job (cron): see lib/push/job. Does nothing until APNs is
 * configured. Returns counts only; failures are logged as counts by status.
 */
export async function sendDuePushes(now = new Date()): Promise<PushRunResult> {
  const config = apnsConfig();
  if (!config) return { configured: false, thoughts: 0, reminders: 0, skippedActive: 0, removed: 0, failed: 0 };
  return runPushJob(dbStore, (tokens, alert, opts) => sendAlerts(config, tokens, alert, opts), now, (message, counts) => console.warn(message, counts));
}

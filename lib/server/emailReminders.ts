import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, desc, eq, gte, inArray, isNull, like, max, sql } from "drizzle-orm";
import { getDb } from "../db";
import { funnelEvents, goalJourneys, legalRecords, pushDevices, pushSends, userActivity, userPrefs, users } from "../db/schema";
import { budapestClock, EMAIL_CONSENT_VERSION, EMAIL_HOUR, EMAIL_LAST_HOUR, emailDue, reminderEmail, unsubscribeUrl, validUnsubscribeToken } from "../email/reminder";
import { isLocale } from "../i18n/config";
import { lastActivity } from "./push";

/*
 * Email reminders (see lib/email/reminder for the rules).
 *
 * Privacy rule for this file, like lib/server/push.ts: it reads only whether
 * and when something happened, the member's language, their email address
 * (from Clerk, at send time, never stored here) and how many days of their
 * own journey are done. Never a journal body, an answer, a goal or any other
 * written content.
 */

export type EmailReminderState = "on" | "off" | "unasked";
export type EmailContext = "popup" | "settings" | "link";

const KIND = "email_reminders";
const BASE_URL = () => process.env.EMAIL_BASE_URL || "https://www.berripop.com";

/** The member's choice: the latest email_reminders record, or "unasked" when there is none. */
export async function getEmailReminderState(userId: string): Promise<EmailReminderState> {
  const [latest] = await getDb().select({ granted: legalRecords.granted }).from(legalRecords)
    .where(and(eq(legalRecords.userId, userId), eq(legalRecords.kind, KIND)))
    .orderBy(desc(legalRecords.createdAt)).limit(1);
  return !latest ? "unasked" : latest.granted ? "on" : "off";
}

/** Records the member's own yes or no (where they said it); nothing changes when it is already so. */
export async function setEmailReminders(userId: string, on: boolean, context: EmailContext): Promise<EmailReminderState> {
  const state = await getEmailReminderState(userId);
  if ((on && state === "on") || (!on && state === "off")) return state;
  await getDb().insert(legalRecords).values({ userId, kind: KIND, version: EMAIL_CONSENT_VERSION, granted: on, context });
  return on ? "on" : "off";
}

/** The unsubscribe link: checks its signature, then records the "no". */
export async function unsubscribeByLink(userId: string, token: string): Promise<boolean> {
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!secret || !userId || !token || !validUnsubscribeToken(userId, token, secret)) return false;
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return true; // A deleted account gets nothing anyway.
  await setEmailReminders(userId, false, "link");
  return true;
}

export type EmailRunResult = { configured: boolean; due: number; sent: number; skippedActive: number; failed: number };

/** Mail provider settings; null until both the provider key and the link secret are set. */
function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!apiKey || !secret) return null;
  return { apiKey, secret, from: process.env.EMAIL_FROM || "Berri a Berripopból <berri@berripop.com>" };
}

/** Members whose latest email_reminders record is a yes. */
async function optedIn(): Promise<string[]> {
  const rows = await getDb().execute<{ user_id: string }>(sql`
    select user_id from (
      select distinct on (user_id) user_id, granted from ${legalRecords}
      where kind = ${KIND} order by user_id, created_at desc
    ) latest where granted`);
  return rows.rows.map(r => r.user_id);
}

/** The local date (Budapest) each member last opened the app or did anything in it. */
async function lastActiveDates(userIds: string[], since: Date): Promise<Map<string, string>> {
  const db = getDb();
  const [activity, opened] = await Promise.all([
    lastActivity(userIds, since),
    db.select({ userId: funnelEvents.userId, at: max(funnelEvents.createdAt) }).from(funnelEvents)
      .where(and(inArray(funnelEvents.userId, userIds), eq(funnelEvents.event, "app_opened"), gte(funnelEvents.createdAt, since))).groupBy(funnelEvents.userId),
  ]);
  const out = new Map<string, string>();
  const note = (userId: string | null, at: Date | string | null) => {
    if (!userId || !at) return;
    const date = budapestClock(new Date(at)).date;
    if ((out.get(userId) ?? "") < date) out.set(userId, date);
  };
  for (const [userId, at] of activity) note(userId, at);
  for (const r of opened) note(r.userId, r.at);
  return out;
}

/** The next day of each member's own journey (null without one, or when it is finished). */
async function nextJourneyDays(userIds: string[]): Promise<Map<string, number>> {
  const db = getDb();
  const journeys = await db.select({ id: goalJourneys.id, userId: goalJourneys.userId }).from(goalJourneys)
    .where(and(inArray(goalJourneys.userId, userIds), isNull(goalJourneys.archivedAt)));
  const out = new Map<string, number>();
  for (const j of journeys) {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(userActivity)
      .where(and(eq(userActivity.userId, j.userId), eq(userActivity.kind, "goal"), like(userActivity.key, `${j.id}:%`)));
    const next = (row?.n ?? 0) + 1;
    if (next <= 21) out.set(j.userId, next);
  }
  return out;
}

async function sendOne(config: NonNullable<ReturnType<typeof emailConfig>>, to: string, email: { subject: string; text: string; html: string }, unsubscribe: string, idempotencyKey: string): Promise<"sent" | "retry" | "failed"> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        from: config.from, to: [to], subject: email.subject, text: email.text, html: email.html,
        headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "sent";
    return res.status === 429 || res.status >= 500 ? "retry" : "failed";
  } catch {
    // A timeout may still have been delivered: the idempotency key stops a second copy if it is retried.
    return "retry";
  }
}

/**
 * The daily run, from the hourly cron: between EMAIL_HOUR and EMAIL_LAST_HOUR
 * Budapest time, one reminder to each opted-in member who is due (emailDue)
 * and was not here today. Not to members whose iPhone already reminds them.
 * At most one a day per member: the run claims (member, "email", date) in
 * push_sends first, so an overlapping run can't send it again.
 * Returns counts only.
 */
export async function sendDueEmails(now = new Date()): Promise<EmailRunResult> {
  const result: EmailRunResult = { configured: false, due: 0, sent: 0, skippedActive: 0, failed: 0 };
  const config = emailConfig();
  if (!config) return result;
  result.configured = true;
  const { date: today, hour } = budapestClock(now);
  if (hour < EMAIL_HOUR || hour > EMAIL_LAST_HOUR) return result;

  const db = getDb();
  let ids = await optedIn();
  if (!ids.length) return result;
  // The iPhone's own reminder is enough.
  const phones = await db.select({ userId: pushDevices.userId }).from(pushDevices).where(and(inArray(pushDevices.userId, ids), eq(pushDevices.remind, true)));
  const reminded = new Set(phones.map(p => p.userId));
  ids = ids.filter(id => !reminded.has(id));
  if (!ids.length) return result;

  const since = new Date(now.getTime() - 35 * 86_400_000);
  const [last, members] = await Promise.all([
    lastActiveDates(ids, since),
    db.select({ id: users.id, createdAt: users.createdAt, locale: userPrefs.locale }).from(users)
      .leftJoin(userPrefs, eq(userPrefs.userId, users.id)).where(inArray(users.id, ids)),
  ]);
  const due = members.filter(m => {
    const lastDay = last.get(m.id) ?? budapestClock(m.createdAt).date;
    if (lastDay >= today) { result.skippedActive++; return false; }
    return emailDue(lastDay, today);
  });
  result.due = due.length;
  if (!due.length) return result;

  const journeyDays = await nextJourneyDays(due.map(m => m.id));
  const clerk = await clerkClient();
  for (const m of due) {
    const claimed = await db.insert(pushSends).values({ userId: m.id, kind: "email", date: today }).onConflictDoNothing().returning({ userId: pushSends.userId });
    if (!claimed.length) continue;
    const release = () => db.delete(pushSends).where(and(eq(pushSends.userId, m.id), eq(pushSends.kind, "email"), eq(pushSends.date, today)));
    let to: string | undefined;
    try {
      const user = await clerk.users.getUser(m.id);
      const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
      if (primary?.verification?.status === "verified") to = primary.emailAddress;
    } catch {
      await release();
      result.failed++;
      continue;
    }
    if (!to) { result.failed++; continue; }
    const unsubscribe = unsubscribeUrl(BASE_URL(), m.id, config.secret);
    const oneClick = unsubscribeUrl(BASE_URL(), m.id, config.secret, "/api/email/unsubscribe");
    const email = reminderEmail(isLocale(m.locale) ? m.locale : "hu", { journeyDay: journeyDays.get(m.id) ?? null, appUrl: new URL("/app", BASE_URL()).toString(), unsubscribeUrl: unsubscribe });
    const outcome = await sendOne(config, to, email, oneClick, `berripop-reminder-${m.id}-${today}`);
    if (outcome === "sent") result.sent++;
    else {
      result.failed++;
      if (outcome === "retry") await release();
    }
  }
  if (result.failed) console.warn("[email] reminders failed", { failed: result.failed });
  return result;
}

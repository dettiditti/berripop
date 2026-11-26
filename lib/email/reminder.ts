import { createHmac, timingSafeEqual } from "node:crypto";
import { addDays } from "../dates";
import type { Locale } from "../i18n/config";

/**
 * Email reminders: the pure rules (unit-tested). Storage, Clerk and the mail
 * provider are wired in lib/server/emailReminders.ts.
 *
 * Opt-in only: a member gets them after saying yes (the popup or Settings),
 * recorded in legal_records as kind "email_reminders". Saying "not now", or
 * unsubscribing, is recorded the same way (granted false), and nobody is
 * signed up by default.
 *
 * Privacy: an email says only that Berri is waiting, and on a member's own
 * journey which day number is next. Never anything the member wrote, their
 * goals, the journey's titles or an AI answer.
 */

export const EMAIL_CONSENT_VERSION = "2026-11-25";

/** Local hour (Europe/Budapest) the reminders go out, and the last hour a late run may still send them. */
export const EMAIL_HOUR = 18;
export const EMAIL_LAST_HOUR = 21;
export const EMAIL_TZ = "Europe/Budapest";

/** The local date and hour in Budapest. */
export function budapestClock(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: EMAIL_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  let n = 0;
  let d = from;
  while (d < to && n < 400) { d = addDays(d, 1); n++; }
  return n;
}

/**
 * Whether a reminder is due today, from the last day the member was active
 * (or joined, if never). Never on a day they were already here. Gentle and
 * then quieter: the first three days away, then once a week up to four weeks,
 * then nothing (until they come back, which starts it over).
 */
export function emailDue(lastActive: string, today: string): boolean {
  const away = daysBetween(lastActive, today);
  if (away <= 0) return false;
  if (away <= 3) return true;
  return away <= 28 && away % 7 === 0;
}

export type ReminderEmail = { subject: string; text: string; html: string };

const COPY = {
  hu: {
    subject: "Berri vár rád 🍇",
    hello: "Szia!",
    day: "Ma a 21 napos utad {n}. napja vár rád. Pár perc az egész.",
    daily: "Ma egy új kérdés vár rád. Pár perc az egész, és csak a tiéd.",
    cta: "Megnyitom a Berripopot",
    gentle: "Ha ma nincs hozzá kedved, az is rendben van.",
    why: "Azért kapod ezt a levelet, mert a Berripopban kérted az e-mail-emlékeztetőt.",
    unsubscribe: "Leiratkozás az emlékeztetőről",
  },
  en: {
    subject: "Berri is waiting for you 🍇",
    hello: "Hi!",
    day: "Day {n} of your 21-day journey is waiting for you today. It only takes a few minutes.",
    daily: "A new question is waiting for you today. It only takes a few minutes, and it's just for you.",
    cta: "Open Berripop",
    gentle: "If you don't feel like it today, that's fine too.",
    why: "You're getting this because you asked for email reminders in Berripop.",
    unsubscribe: "Unsubscribe from reminders",
  },
} as const;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The reminder itself. `journeyDay`: the next day of the member's own journey, if they have one. */
export function reminderEmail(locale: Locale, opts: { journeyDay: number | null; appUrl: string; unsubscribeUrl: string }): ReminderEmail {
  const c = COPY[locale];
  const line = opts.journeyDay ? c.day.replace("{n}", String(opts.journeyDay)) : c.daily;
  const text = [c.hello, "", line, "", `${c.cta}: ${opts.appUrl}`, "", c.gentle, "", "—", c.why, `${c.unsubscribe}: ${opts.unsubscribeUrl}`].join("\n");
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f6f3ff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a2340">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border-radius:24px;padding:28px 24px">
<p style="font-size:20px;font-weight:800;margin:0 0 12px">${escape(c.hello)}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">${escape(line)}</p>
<a href="${escape(opts.appUrl)}" style="display:inline-block;background:#7a4dff;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:16px">${escape(c.cta)}</a>
<p style="font-size:14px;line-height:1.5;color:#6b6585;margin:24px 0 0">${escape(c.gentle)}</p>
</div>
<p style="font-size:12px;line-height:1.5;color:#8a84a3;margin:20px 8px 0">${escape(c.why)}<br><a href="${escape(opts.unsubscribeUrl)}" style="color:#8a84a3">${escape(c.unsubscribe)}</a></p>
</div></body></html>`;
  return { subject: c.subject, text, html };
}

/* ---------- Unsubscribe links ---------- */

/** A signature over the member id, so an unsubscribe link works without signing in and can't be forged for someone else. */
export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-unsubscribe:${userId}`).digest("base64url");
}

export function validUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The link in the email opens a page that asks once ("/email/unsubscribe"), so
 * a mail scanner opening links can't unsubscribe anyone; the List-Unsubscribe
 * header uses the one-click POST endpoint ("/api/email/unsubscribe", RFC 8058).
 */
export function unsubscribeUrl(base: string, userId: string, secret: string, path: "/email/unsubscribe" | "/api/email/unsubscribe" = "/email/unsubscribe"): string {
  const u = new URL(path, base);
  u.searchParams.set("u", userId);
  u.searchParams.set("t", unsubscribeToken(userId, secret));
  return u.toString();
}

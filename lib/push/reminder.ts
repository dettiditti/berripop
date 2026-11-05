import type { Locale } from "../i18n/config";

/** An APNs device token: hex, 64 characters today, allowed to grow. */
export function isDeviceToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64,200}$/i.test(v);
}

/**
 * The daily reminder's text. Fixed and general on purpose: a notification
 * shows on the lock screen, so it never names a goal, a question or anything
 * the member wrote.
 */
export function reminderText(locale: Locale): { title: string; body: string } {
  return locale === "en"
    ? { title: "Berri is here", body: "A few minutes just for you: today's question is waiting." }
    : { title: "Berri itt van", body: "Pár perc csak magadra: vár a mai kérdésed." };
}

export type ReminderDevice = { token: string; userId: string; lastSentDate: string | null };

/**
 * Who gets today's reminder: devices not reminded yet today, of members who
 * have not done today's step yet.
 */
export function devicesToRemind(devices: ReminderDevice[], doneToday: Set<string>, today: string): ReminderDevice[] {
  return devices.filter(d => d.lastSentDate !== today && !doneToday.has(d.userId));
}

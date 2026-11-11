/**
 * When each phone gets its notifications. Pure (no I/O), so it is unit-tested
 * directly. The sending job runs every hour (and may run more often, or
 * twice at once); each phone is due in the first run at or after its chosen
 * local hour. "At most once a day per member and kind" is finally enforced by
 * the database (push_sends, lib/server/push), this only decides who to try.
 */

export const REMIND_HOURS = [17, 18, 19, 20, 21, 22] as const;
export const THOUGHT_HOURS = [6, 7, 8, 9, 10, 11] as const;
export const DEFAULT_TIME_ZONE = "Europe/Budapest";
/**
 * The catch-up window, in the phone's local hours: a notification set for H
 * is due in any run whose local hour is H, H+1 or H+2, on the same local
 * date, and only until it has gone out once.
 * - The hourly run comes at about :07; GitHub may start it late or skip it.
 *   A late or skipped run is made up by the next one inside the window; if
 *   every run in the window is missed, that day's notification is skipped
 *   (never sent the next day). Vercel's daily run at 17:00 UTC is a backstop
 *   for 17:00 to 19:00 choices in Central Europe.
 * - The window is always counted in local hours of the local date, so it
 *   cannot reach past midnight (22:00 + 2 = 24:00 at the latest) and daylight
 *   saving changes (at 2 to 3 am in Europe and America) never fall inside it.
 * - When the phone's time zone changes, the window follows the new local
 *   time, and MIN_GAP_HOURS keeps it from repeating the same day twice.
 */
export const CATCH_UP_HOURS = 3;

export type PushKind = "thought" | "remind";
export type PushPrefs = { remind: boolean; remindHour: number; thought: boolean; thoughtHour: number; personalize: boolean };
export const DEFAULT_PREFS: PushPrefs = { remind: true, remindHour: 17, thought: true, thoughtHour: 8, personalize: true };

/** A real IANA time zone name, or the default. */
export function cleanTimeZone(v: unknown): string {
  if (typeof v !== "string" || !v || v.length > 64) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Keeps only known values; anything missing or wrong falls back to the current value. */
export function cleanPrefs(raw: unknown, base: PushPrefs = DEFAULT_PREFS): PushPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hour = (v: unknown, allowed: readonly number[], fallback: number) => (typeof v === "number" && allowed.includes(v) ? v : fallback);
  const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    remind: flag(r.remind, base.remind),
    remindHour: hour(r.remindHour, REMIND_HOURS, base.remindHour),
    thought: flag(r.thought, base.thought),
    thoughtHour: hour(r.thoughtHour, THOUGHT_HOURS, base.thoughtHour),
    personalize: flag(r.personalize, base.personalize),
  };
}

/** The local date (YYYY-MM-DD) and hour (0-23) in a time zone, daylight saving included. */
export function localClock(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: cleanTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/** When the local day ends in a time zone (the next local midnight). */
export function endOfLocalDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: cleanTimeZone(timeZone), hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return new Date(Math.floor(now.getTime() / 1000) * 1000 + (86_400 - elapsed) * 1000);
}

/**
 * A second notification of the same kind needs at least this long after the
 * last one, whatever the dates say. This covers a phone whose time zone
 * changed (a flight west can start "today" again) and a member whose phones
 * are in different time zones. Moving a time earlier (11:00 to 6:00, or
 * 22:00 to 17:00) can delay the first notification at the new time by up to
 * one hour (it lands in the catch-up window).
 */
export const MIN_GAP_HOURS = 18;

export type ScheduledDevice = PushPrefs & { token: string; userId: string; timeZone: string };

/** What the job already knows: who was active, and what already went out, per local date. */
export type DueContext = {
  /** `${userId}|${date}`: the member did something in the app on that local date. */
  active: ReadonlySet<string>;
  /** `${kind}|${userId}|${date}`: already sent (push_sends). */
  sent: ReadonlySet<string>;
};

export const activeKey = (userId: string, date: string) => `${userId}|${date}`;
export const sentKey = (kind: PushKind, userId: string, date: string) => `${kind}|${userId}|${date}`;

const inWindow = (hour: number, chosen: number) => hour >= chosen && hour < chosen + CATCH_UP_HOURS;

/**
 * What a phone is due right now. The afternoon reminder is skipped for
 * members who already did something in the app on their local date; Berri's
 * thought goes out regardless. Switched-off kinds are never due.
 */
export function dueNow(d: ScheduledDevice, now: Date, ctx: DueContext): { remind: boolean; thought: boolean; date: string } {
  const { date, hour } = localClock(now, d.timeZone);
  return {
    date,
    remind: d.remind && inWindow(hour, d.remindHour) && !ctx.sent.has(sentKey("remind", d.userId, date)) && !ctx.active.has(activeKey(d.userId, date)),
    thought: d.thought && inWindow(hour, d.thoughtHour) && !ctx.sent.has(sentKey("thought", d.userId, date)),
  };
}

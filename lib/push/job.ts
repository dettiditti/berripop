import type { Area } from "../assessment/model";
import type { CheckinState } from "../checkin/checkin";
import { isLocale, type Locale } from "../i18n/config";
import { isDeadToken, isRetryable, NOT_SENT, type SendOptions, type SendResult } from "./apns";
import { reminderText } from "./reminder";
import { activeKey, cleanPrefs, dueNow, endOfLocalDay, localClock, MIN_GAP_HOURS, sentKey, type PushKind, type PushPrefs } from "./schedule";
import { pickThought, thoughtNotification } from "./thoughts";

/**
 * The notification run, apart from the database and Apple (lib/server/push
 * wires those in), so it is unit-tested directly.
 *
 * Privacy: everything the run may know about a member is in this file's
 * types. Activity is a timestamp, the thought's signals are picked areas and
 * a mood word; there is no field that could carry anything the member wrote.
 */

export type DeviceRow = PushPrefs & { token: string; userId: string; timeZone: string; locale: string | null };
export type ThoughtInputs = { areas: Map<string, Area[]>; moods: Map<string, CheckinState> };
export type Alert = { title: string; body: string };

export interface PushStore {
  /** Deletes send-log rows older than this. */
  pruneSends(before: Date): Promise<void>;
  devices(): Promise<DeviceRow[]>;
  /** The member's latest activity of any kind since `since`: a time only. */
  lastActivity(userIds: string[], since: Date): Promise<Map<string, Date>>;
  /** Send-log rows of these members. */
  sends(userIds: string[]): Promise<{ userId: string; kind: PushKind; date: string; sentAt: Date }[]>;
  thoughtInputs(userIds: string[], now: Date): Promise<ThoughtInputs>;
  /** Records (member, kind, date) unless it already exists; true only for the caller that created it. */
  claim(userId: string, kind: PushKind, date: string): Promise<boolean>;
  release(userId: string, kind: PushKind, date: string): Promise<void>;
  markReminded(tokens: string[], date: string): Promise<void>;
  removeDevices(tokens: string[]): Promise<void>;
}

export type Sender = (tokens: string[], alert: Alert, opts: SendOptions) => Promise<SendResult[]>;
export type Logger = (message: string, counts: Record<string, number>) => void;
export type PushRunResult = { configured: boolean; thoughts: number; reminders: number; skippedActive: number; removed: number; failed: number };

/** How long the send log is kept: long enough to cover any time zone's "today". */
export const SEND_LOG_DAYS = 3;
/** Activity older than this cannot fall on anyone's local today. */
export const LOOKBACK_MS = 48 * 3600_000;

/** Failure counts by HTTP status and APNs reason only: never a token, member or text. */
export function failureSummary(results: SendResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) {
    if (r.ok) continue;
    const key = `${r.status}:${r.reason ?? "-"}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * One run: Berri's thought at each phone's morning hour, the afternoon
 * reminder at its hour unless the member was already active that local day.
 *
 * At most once a day per member and kind, on all their phones together:
 * - the run claims (member, kind, local date) before sending; an overlapping
 *   run cannot claim it again (a unique key in the database);
 * - all of a member's phones that are due share that one claim, and a phone
 *   due later the same day finds it already sent;
 * - nothing of the same kind goes out within MIN_GAP_HOURS of the last one,
 *   even when the local date differs (time zone changed, phones in two zones).
 *
 * Retrying: a claim is released only when nothing was delivered and Apple
 * definitely did not take it (it answered "busy" or "error", or the request
 * never left). A timeout or dropped connection keeps the claim: Apple may
 * have delivered it, and a missed notification is better than a double one.
 * Each notification also carries a collapse id per kind and date, so a phone
 * that somehow gets it twice shows it once, and it expires at local midnight.
 * Devices Apple says are gone are deleted.
 */
export async function runPushJob(store: PushStore, send: Sender, now: Date, log: Logger = () => {}): Promise<PushRunResult> {
  const result: PushRunResult = { configured: true, thoughts: 0, reminders: 0, skippedActive: 0, removed: 0, failed: 0 };
  await store.pruneSends(new Date(now.getTime() - SEND_LOG_DAYS * 86_400_000));
  const devices = (await store.devices()).filter(d => d.remind || d.thought);
  if (!devices.length) return result;

  const userIds = [...new Set(devices.map(d => d.userId))];
  const [last, sendRows] = await Promise.all([store.lastActivity(userIds, new Date(now.getTime() - LOOKBACK_MS)), store.sends(userIds)]);
  const sent = new Set(sendRows.map(r => sentKey(r.kind, r.userId, r.date)));
  const gapStart = now.getTime() - MIN_GAP_HOURS * 3600_000;
  const recent = new Set(sendRows.filter(r => new Date(r.sentAt).getTime() > gapStart).map(r => `${r.kind}|${r.userId}`));
  const active = new Set<string>();
  for (const d of devices) {
    const at = last.get(d.userId);
    if (at) active.add(activeKey(d.userId, localClock(at, d.timeZone).date));
  }

  type Group = { userId: string; kind: PushKind; date: string; timeZone: string; locale: Locale; personalize: boolean; tokens: string[] };
  const groups = new Map<string, Group>();
  const skipped = new Set<string>();
  for (const row of devices) {
    const device = { ...cleanPrefs(row), token: row.token, userId: row.userId, timeZone: row.timeZone };
    const due = dueNow(device, now, { active, sent });
    if (!due.remind && dueNow(device, now, { active: new Set(), sent }).remind) skipped.add(device.userId);
    for (const kind of ["thought", "remind"] as const) {
      const key = `${kind}|${device.userId}`;
      if (!due[kind] || recent.has(key)) continue;
      const g = groups.get(key) ?? { userId: device.userId, kind, date: due.date, timeZone: device.timeZone, locale: isLocale(row.locale) ? row.locale : "hu", personalize: device.personalize, tokens: [] };
      g.tokens.push(device.token);
      groups.set(key, g);
    }
  }
  result.skippedActive = skipped.size;
  if (!groups.size) return result;

  const personal = [...groups.values()].filter(g => g.kind === "thought" && g.personalize).map(g => g.userId);
  const inputs: ThoughtInputs = personal.length ? await store.thoughtInputs(personal, now) : { areas: new Map(), moods: new Map() };

  const claims: (Group & { alert: Alert })[] = [];
  for (const g of groups.values()) {
    if (!(await store.claim(g.userId, g.kind, g.date))) continue;
    const alert = g.kind === "remind"
      ? reminderText(g.locale)
      : thoughtNotification(pickThought(g.date, {
        personalize: g.personalize,
        areas: inputs.areas.get(g.userId),
        mood: inputs.moods.get(g.userId) ?? null,
        // Explicit feedback on thoughts is not collected yet; when it is, it goes here.
        liked: [], disliked: [],
      }), g.locale);
    claims.push({ ...g, alert });
  }

  // Phones that get the same text, collapse id and expiry go out together.
  const batches = new Map<string, { alert: Alert; opts: SendOptions; tokens: string[] }>();
  for (const c of claims) {
    const expiresAt = Math.floor(Math.min(now.getTime() + 6 * 3600_000, endOfLocalDay(now, c.timeZone).getTime()) / 1000);
    const opts: SendOptions = { collapseId: `berripop-${c.kind}-${c.date}`, expiresAt };
    const key = `${c.alert.title}\n${c.alert.body}\n${opts.collapseId}\n${expiresAt}`;
    const b = batches.get(key) ?? { alert: c.alert, opts, tokens: [] };
    b.tokens.push(...c.tokens);
    batches.set(key, b);
  }
  const results = new Map<string, SendResult>();
  for (const b of batches.values()) {
    let out: SendResult[];
    try {
      out = await send(b.tokens, b.alert, b.opts);
    } catch {
      // The sender failed before any request left (lib/push/apns sends nothing until its key works).
      out = b.tokens.map(token => ({ token, ok: false, status: 0, reason: NOT_SENT }));
    }
    for (const r of out) results.set(r.token, r);
  }

  const dead = new Set<string>();
  const failures: SendResult[] = [];
  for (const c of claims) {
    const own = c.tokens.map(t => results.get(t) ?? { token: t, ok: false, status: 0, reason: "no_answer" });
    const ok = own.filter(r => r.ok);
    own.filter(isDeadToken).forEach(r => dead.add(r.token));
    failures.push(...own.filter(r => !r.ok));
    if (ok.length) {
      if (c.kind === "thought") result.thoughts++;
      else { result.reminders++; await store.markReminded(ok.map(r => r.token), c.date); }
    } else if (own.every(isRetryable)) {
      await store.release(c.userId, c.kind, c.date);
    }
  }
  if (dead.size) await store.removeDevices([...dead]);
  result.removed = dead.size;
  result.failed = failures.length;
  if (failures.length) log("[push] deliveries failed", failureSummary(failures));
  return result;
}

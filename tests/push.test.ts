import { readFileSync } from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { apnsConfig, isDeadToken, isRetryable, providerToken } = await import("../lib/push/apns");
const { isDeviceToken, reminderText } = await import("../lib/push/reminder");
const { CATCH_UP_HOURS, MIN_GAP_HOURS, endOfLocalDay, cleanPrefs, cleanTimeZone, dueNow, localClock, sentKey, activeKey, DEFAULT_PREFS, REMIND_HOURS, THOUGHT_HOURS } = await import("../lib/push/schedule");
const { allThoughts, checkThoughtLibrary, generalThought, pickThought, thoughtNotification, THOUGHT_CATEGORIES, THOUGHT_COUNT } = await import("../lib/push/thoughts");
const { failureSummary, runPushJob } = await import("../lib/push/job");
const { AREAS } = await import("../lib/assessment/model");
const { CHECKIN_STATES } = await import("../lib/checkin/checkin");
import type { DeviceRow, PushStore, Sender, ThoughtInputs } from "../lib/push/job";
import type { SendResult } from "../lib/push/apns";
import type { PushKind } from "../lib/push/schedule";

const token = "a".repeat(64);
const none = { active: new Set<string>(), sent: new Set<string>() };

describe("notification texts", () => {
  it("accepts only APNs-style hex tokens", () => {
    expect(isDeviceToken(token)).toBe(true);
    expect(isDeviceToken("A1".repeat(40))).toBe(true);
    expect(isDeviceToken("abc")).toBe(false);
    expect(isDeviceToken("z".repeat(64))).toBe(false);
    expect(isDeviceToken(`${token}; drop`)).toBe(false);
    expect(isDeviceToken(42)).toBe(false);
  });

  it("uses the fixed afternoon text, the same every day and for everyone", () => {
    expect(reminderText("hu")).toEqual({
      title: "Hé, ne felejtsd el magad! 💜",
      body: "A mai napodban is legyen egy kis idő, ami csak rólad szól. Ugorj be Berripopba, nézd meg, hol tartasz, írj pár sort, vagy tegyél egy apró lépést önmagadért. Nem kell nagy dolgot véghezvinned.",
    });
    expect(reminderText("en").title).toContain("💜");
    expect(reminderText("hu")).toBe(reminderText("hu"));
    for (const locale of ["hu", "en"] as const) expect(Object.values(reminderText(locale)).join(" ")).not.toMatch(/\{|\}/);
  });
});

describe("schedule", () => {
  it("reads the local hour and date in the phone's own time zone", () => {
    const now = new Date("2026-07-01T17:30:00Z");
    expect(localClock(now, "Europe/Budapest")).toEqual({ date: "2026-07-01", hour: 19 });
    expect(localClock(now, "America/New_York")).toEqual({ date: "2026-07-01", hour: 13 });
    expect(localClock(now, "Asia/Tokyo")).toEqual({ date: "2026-07-02", hour: 2 });
    expect(localClock(new Date("2026-07-01T23:30:00Z"), "Europe/Budapest")).toEqual({ date: "2026-07-02", hour: 1 });
    expect(cleanTimeZone("Not/AZone")).toBe("Europe/Budapest");
    expect(cleanTimeZone(42)).toBe("Europe/Budapest");
    expect(cleanTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("follows daylight saving time changes", () => {
    // Budapest springs forward on 29 March 2026 and falls back on 25 October 2026.
    expect(localClock(new Date("2026-03-28T07:00:00Z"), "Europe/Budapest").hour).toBe(8);
    expect(localClock(new Date("2026-03-29T06:00:00Z"), "Europe/Budapest").hour).toBe(8);
    expect(localClock(new Date("2026-10-24T06:00:00Z"), "Europe/Budapest").hour).toBe(8);
    expect(localClock(new Date("2026-10-25T07:00:00Z"), "Europe/Budapest").hour).toBe(8);
    // New York: 8 March and 1 November 2026.
    expect(localClock(new Date("2026-03-09T12:00:00Z"), "America/New_York").hour).toBe(8);
    expect(localClock(new Date("2026-11-02T13:00:00Z"), "America/New_York").hour).toBe(8);
    // 8:00 is due at 06:xx UTC after the spring change, but not the day before.
    const d = { ...DEFAULT_PREFS, token: "t", userId: "u", timeZone: "Europe/Budapest", thoughtHour: 8 };
    expect(dueNow(d, new Date("2026-03-29T06:07:00Z"), none).thought).toBe(true);
    expect(dueNow(d, new Date("2026-03-28T06:07:00Z"), none).thought).toBe(false);
  });

  it("keeps only the offered hours and real switches, defaulting to 8:00 and 17:00", () => {
    expect(DEFAULT_PREFS).toEqual({ remind: true, remindHour: 17, thought: true, thoughtHour: 8, personalize: true });
    expect(REMIND_HOURS[0]).toBe(17);
    expect(REMIND_HOURS.at(-1)).toBe(22);
    expect(THOUGHT_HOURS[0]).toBe(6);
    expect(THOUGHT_HOURS.at(-1)).toBe(11);
    expect(cleanPrefs({ remindHour: 3, thoughtHour: 9, remind: "yes", thought: false })).toEqual({ ...DEFAULT_PREFS, thoughtHour: 9, thought: false });
    expect(cleanPrefs({ remindHour: 21 }, { ...DEFAULT_PREFS, thought: false }).thought).toBe(false);
    expect(cleanPrefs({ personalize: false }).personalize).toBe(false);
    expect(cleanPrefs({ thoughtHour: 12 }).thoughtHour).toBe(8);
  });

  it("is due at the chosen local hour, once a day, and the afternoon one only on inactive days", () => {
    const base = { ...DEFAULT_PREFS, token: "t", userId: "u", timeZone: "Europe/Budapest" };
    const at = (iso: string) => new Date(iso);
    // 08:10 Budapest in winter = 07:10 UTC: the thought is due, the afternoon reminder is not.
    expect(dueNow(base, at("2026-11-12T07:10:00Z"), none)).toEqual({ date: "2026-11-12", thought: true, remind: false });
    // Already sent today: nothing.
    expect(dueNow(base, at("2026-11-12T07:10:00Z"), { ...none, sent: new Set([sentKey("thought", "u", "2026-11-12")]) }).thought).toBe(false);
    // A late run still catches up for a few hours.
    expect(dueNow(base, at("2026-11-12T09:30:00Z"), none).thought).toBe(true);
    expect(dueNow(base, at(`2026-11-12T${String(7 + CATCH_UP_HOURS).padStart(2, "0")}:05:00Z`), none).thought).toBe(false);
    // 17:05 Budapest = 16:05 UTC: the reminder, unless the member was active today.
    expect(dueNow(base, at("2026-11-12T16:05:00Z"), none).remind).toBe(true);
    expect(dueNow(base, at("2026-11-12T16:05:00Z"), { ...none, active: new Set([activeKey("u", "2026-11-12")]) }).remind).toBe(false);
    // Active yesterday does not count for today.
    expect(dueNow(base, at("2026-11-12T16:05:00Z"), { ...none, active: new Set([activeKey("u", "2026-11-11")]) }).remind).toBe(true);
    // Switched off: never.
    expect(dueNow({ ...base, remind: false }, at("2026-11-12T16:05:00Z"), none).remind).toBe(false);
    expect(dueNow({ ...base, thought: false }, at("2026-11-12T07:10:00Z"), none).thought).toBe(false);
    // A later chosen hour: not yet, then due.
    expect(dueNow({ ...base, remindHour: 21 }, at("2026-11-12T16:05:00Z"), none).remind).toBe(false);
    expect(dueNow({ ...base, remindHour: 21 }, at("2026-11-12T20:05:00Z"), none).remind).toBe(true);
  });

  it("never sends a missed notification the next day", () => {
    const late = { ...DEFAULT_PREFS, token: "t", userId: "u", timeZone: "Europe/Budapest", remindHour: 22 };
    // 00:30 Budapest on the 13th: yesterday's 22:00 is not caught up.
    expect(dueNow(late, new Date("2026-11-12T23:30:00Z"), none)).toEqual({ date: "2026-11-13", thought: false, remind: false });
    // 23:30 on the 12th is still the same day.
    expect(dueNow(late, new Date("2026-11-12T22:30:00Z"), none).remind).toBe(true);
    for (const h of REMIND_HOURS) expect(h + CATCH_UP_HOURS - 1).toBeLessThanOrEqual(24);
  });
});

describe("Berri's thoughts", () => {
  it("has 40 tagged thoughts with stable ids, in both languages, short enough for the lock screen", () => {
    const list = allThoughts();
    expect(THOUGHT_COUNT).toBe(40);
    expect(new Set(list.map(t => t.id)).size).toBe(list.length);
    for (const locale of ["hu", "en"] as const) {
      expect(new Set(list.map(t => t[locale])).size).toBe(list.length);
      for (const t of list) {
        expect(t[locale].length).toBeGreaterThan(10);
        expect(t[locale].length).toBeLessThanOrEqual(120);
      }
    }
    for (const t of list) {
      expect(t.id).toMatch(/^t\d{3}$/);
      expect(THOUGHT_CATEGORIES).toContain(t.category);
      for (const a of t.areas) expect(AREAS).toContain(a);
      for (const m of t.moods) expect(CHECKIN_STATES).toContain(m);
    }
    expect(checkThoughtLibrary(list)).toEqual([]);
    // Every theme has thoughts, some are playful, and every picked area and mood has thoughts to choose from.
    for (const c of THOUGHT_CATEGORIES) expect(list.filter(t => t.category === c).length).toBeGreaterThanOrEqual(2);
    expect(list.filter(t => t.tone === "playful").length).toBeGreaterThanOrEqual(3);
    for (const a of AREAS.filter(a => a !== "other")) expect(list.some(t => t.areas.includes(a))).toBe(true);
    for (const m of CHECKIN_STATES) expect(list.some(t => t.moods.includes(m))).toBe(true);
  });

  it("catches tagging mistakes before a new thought is added", () => {
    const ok = allThoughts()[0];
    const bad = [
      ok,
      { ...ok, id: "t001" },
      { ...ok, id: "x2", hu: "Rövid", en: "Fine text that is long enough." },
      { ...ok, id: "t500", category: "playful" as never, areas: ["other" as never], moods: ["angry" as never], hu: "Hívd fel {name}-t ma 3-kor.", en: "x".repeat(121) },
    ];
    const problems = checkThoughtLibrary(bad);
    expect(problems).toEqual(expect.arrayContaining([
      "t001: ids out of order", "t001: duplicate id", "x2: id", "x2: hu text",
      "t500: category", "t500: areas", "t500: moods", "t500: hu text", "t500: en text",
    ]));
  });

  it("gives everyone the same general thought each day, a new one the next day", () => {
    expect(generalThought("2026-11-12")).toBe(generalThought("2026-11-12"));
    expect(generalThought("2026-11-12")).not.toBe(generalThought("2026-11-13"));
    expect(pickThought("2026-11-12", { personalize: false, mood: "sad", areas: ["relationships"] })).toBe(generalThought("2026-11-12"));
    expect(pickThought("2026-11-12", { personalize: true })).toBe(generalThought("2026-11-12"));
    expect(pickThought("2026-11-12", { personalize: true, areas: ["other"] })).toBe(generalThought("2026-11-12"));
    const n = thoughtNotification(generalThought("2026-11-12"), "hu");
    expect(n.title).toBe("Berri mai gondolata 💜");
    expect(n.body).toBe(generalThought("2026-11-12").hu);
  });

  it("fits the thought to the picked areas and check-in mood when personalization is on", () => {
    for (const mood of CHECKIN_STATES) {
      const t = pickThought("2026-11-12", { personalize: true, mood });
      expect(t.moods).toContain(mood);
    }
    for (const day of ["2026-11-12", "2026-11-13", "2026-11-14"]) {
      expect(pickThought(day, { personalize: true, areas: ["relationships"] }).areas).toContain("relationships");
    }
    const both = pickThought("2026-11-12", { personalize: true, mood: "tense", areas: ["stress"] });
    expect(both.moods).toContain("tense");
    expect(both.areas).toContain("stress");
    // Stable within a day.
    expect(pickThought("2026-11-12", { personalize: true, mood: "sad" })).toBe(pickThought("2026-11-12", { personalize: true, mood: "sad" }));
  });

  it("never picks a thought the member disliked", () => {
    const signals = { personalize: true, mood: "sad" as const };
    const first = pickThought("2026-11-12", signals);
    expect(pickThought("2026-11-12", { ...signals, disliked: [first.id] }).id).not.toBe(first.id);
    const general = generalThought("2026-11-12");
    expect(pickThought("2026-11-12", { personalize: false, disliked: [general.id] }).id).not.toBe(general.id);
  });
});

/** An in-memory stand-in for the database, with the same once-only claim rule. */
function memoryStore(devices: DeviceRow[], opts: { lastActivity?: Map<string, Date>; inputs?: ThoughtInputs } = {}) {
  const log = new Map<string, Date>();
  const calls = { thoughtInputs: [] as string[][], reminded: [] as string[] };
  const store: PushStore & { devicesNow: DeviceRow[]; log: Map<string, Date>; calls: typeof calls; at: Date } = {
    devicesNow: devices, log, calls, at: new Date(0),
    async pruneSends(before) { for (const [k, at] of log) if (at < before) log.delete(k); },
    async devices() { return store.devicesNow.map(d => ({ ...d })); },
    async lastActivity() { return opts.lastActivity ?? new Map(); },
    async sends(userIds) {
      return [...log.keys()].map(k => k.split("|")).filter(([, u]) => userIds.includes(u)).map(([kind, userId, date]) => ({ kind: kind as PushKind, userId, date, sentAt: log.get(sentKey(kind as PushKind, userId, date))! }));
    },
    async thoughtInputs(userIds) { calls.thoughtInputs.push(userIds); return opts.inputs ?? { areas: new Map(), moods: new Map() }; },
    async claim(userId, kind, date) {
      const k = sentKey(kind, userId, date);
      await Promise.resolve();
      if (log.has(k)) return false;
      log.set(k, store.at);
      return true;
    },
    async release(userId, kind, date) { log.delete(sentKey(kind, userId, date)); },
    async markReminded(tokens) { calls.reminded.push(...tokens); },
    async removeDevices(tokens) { store.devicesNow = store.devicesNow.filter(d => !tokens.includes(d.token)); },
  };
  return store;
}

/** Runs the job with the in-memory store's clock set to the same moment. */
const run = (store: ReturnType<typeof memoryStore>, send: Sender, now: Date, log?: (m: string, c: Record<string, number>) => void) => {
  store.at = now;
  return runPushJob(store, send, now, log);
};

function recordingSender(fail: (token: string) => SendResult | null = () => null) {
  const sent: { tokens: string[]; title: string; body: string; collapseId?: string; expiresAt?: number }[] = [];
  const send: Sender = async (tokens, alert, opts) => {
    sent.push({ tokens, ...alert, ...opts });
    return tokens.map(t => fail(t) ?? { token: t, ok: true, status: 200 });
  };
  return { send, sent };
}

const phone = (over: Partial<DeviceRow> = {}): DeviceRow => ({ ...DEFAULT_PREFS, token: "a".repeat(64), userId: "u1", timeZone: "Europe/Budapest", locale: "hu", ...over });
// 8:07 and 17:07 in Budapest on 12 November 2026 (winter time, UTC+1).
const MORNING = new Date("2026-11-12T07:07:00Z");
const AFTERNOON = new Date("2026-11-12T16:07:00Z");

describe("notification job", () => {
  it("sends the morning thought once, however often the endpoint is called", async () => {
    const store = memoryStore([phone()]);
    const { send, sent } = recordingSender();
    expect(await run(store, send, MORNING)).toMatchObject({ thoughts: 1, reminders: 0 });
    expect(await run(store, send, MORNING)).toMatchObject({ thoughts: 0 });
    expect(await run(store, send, new Date(MORNING.getTime() + 3600_000))).toMatchObject({ thoughts: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe("Berri mai gondolata 💜");
    expect(allThoughts().map(t => t.hu)).toContain(sent[0].body);
  });

  it("does not double-send when two runs overlap", async () => {
    const store = memoryStore([phone()]);
    const { send, sent } = recordingSender();
    const [a, b] = await Promise.all([run(store, send, MORNING), run(store, send, MORNING)]);
    expect(a.thoughts + b.thoughts).toBe(1);
    expect(sent.flatMap(s => s.tokens)).toHaveLength(1);
  });

  it("sends at most once per member and kind, even with two phones", async () => {
    const store = memoryStore([phone(), phone({ token: "b".repeat(64) })]);
    const { send, sent } = recordingSender();
    expect(await run(store, send, AFTERNOON)).toMatchObject({ reminders: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].tokens).toHaveLength(2);
    expect(await run(store, send, AFTERNOON)).toMatchObject({ reminders: 0 });
  });

  it("sends the fixed afternoon reminder only when the member was not active that local day", async () => {
    const quiet = memoryStore([phone()]);
    const q = recordingSender();
    expect(await run(quiet, q.send, AFTERNOON)).toMatchObject({ reminders: 1, skippedActive: 0 });
    expect(q.sent[0]).toMatchObject(reminderText("hu"));
    expect(quiet.calls.reminded).toEqual([phone().token]);

    const busy = memoryStore([phone()], { lastActivity: new Map([["u1", new Date("2026-11-12T09:00:00Z")]]) });
    const b = recordingSender();
    expect(await run(busy, b.send, AFTERNOON)).toMatchObject({ reminders: 0, skippedActive: 1 });
    expect(b.sent).toHaveLength(0);

    // Active late yesterday evening (local) does not count for today.
    const yesterday = memoryStore([phone()], { lastActivity: new Map([["u1", new Date("2026-11-11T22:30:00Z")]]) });
    const y = recordingSender();
    expect(await run(yesterday, y.send, AFTERNOON)).toMatchObject({ reminders: 1 });
  });

  it("judges 'today' in the phone's own time zone", async () => {
    // 17:07 in New York = 22:07 UTC. Activity at 03:00 UTC on the 12th was still the 11th in New York.
    const ny = phone({ timeZone: "America/New_York" });
    const now = new Date("2026-11-12T22:07:00Z");
    const store = memoryStore([ny], { lastActivity: new Map([["u1", new Date("2026-11-12T03:00:00Z")]]) });
    const { send, sent } = recordingSender();
    expect(await run(store, send, now)).toMatchObject({ reminders: 1 });
    expect(sent).toHaveLength(1);
    expect(await run(memoryStore([ny]), send, MORNING)).toMatchObject({ thoughts: 0 });
  });

  it("sends nothing for switched-off notifications", async () => {
    const store = memoryStore([phone({ thought: false, remind: false })]);
    const { send, sent } = recordingSender();
    await run(store, send, MORNING);
    await run(store, send, AFTERNOON);
    expect(sent).toHaveLength(0);
  });

  it("follows a changed time, without sending twice on the same day", async () => {
    const store = memoryStore([phone({ remindHour: 20 })]);
    const { send, sent } = recordingSender();
    expect(await run(store, send, AFTERNOON)).toMatchObject({ reminders: 0 });
    expect(await run(store, send, new Date("2026-11-12T19:07:00Z"))).toMatchObject({ reminders: 1 });
    // Moved to 21:00 after today's went out: nothing more today, back to normal tomorrow.
    store.devicesNow = [phone({ remindHour: 21 })];
    expect(await run(store, send, new Date("2026-11-12T20:07:00Z"))).toMatchObject({ reminders: 0 });
    expect(await run(store, send, new Date("2026-11-13T20:07:00Z"))).toMatchObject({ reminders: 1 });
    expect(sent).toHaveLength(2);
  });

  it("forgets dead tokens, and retries later the same day after a passing failure", async () => {
    const dead = "d".repeat(64);
    const store = memoryStore([phone({ token: dead })]);
    const gone = recordingSender(t => (t === dead ? { token: t, ok: false, status: 410, reason: "Unregistered" } : null));
    const logs: Record<string, number>[] = [];
    expect(await run(store, gone.send, MORNING, (_m, c) => logs.push(c))).toMatchObject({ thoughts: 0, removed: 1, failed: 1 });
    expect(store.devicesNow).toHaveLength(0);
    expect(logs).toEqual([{ "410:Unregistered": 1 }]);
    expect(JSON.stringify(logs)).not.toContain(dead);

    // Apple answered "busy": nothing was delivered, so a later run that day retries.
    const busy = memoryStore([phone()]);
    let down = true;
    const apple = recordingSender(t => (down ? { token: t, ok: false, status: 503, reason: "ServiceUnavailable" } : null));
    expect(await run(busy, apple.send, MORNING)).toMatchObject({ thoughts: 0, removed: 0, failed: 1 });
    expect(busy.log.size).toBe(0);
    down = false;
    expect(await run(busy, apple.send, new Date(MORNING.getTime() + 3600_000))).toMatchObject({ thoughts: 1 });
    expect(busy.devicesNow).toHaveLength(1);
  });

  it("does not retry when Apple's answer was lost, so it never arrives twice", async () => {
    const store = memoryStore([phone()]);
    let lost = true;
    const net = recordingSender(t => (lost ? { token: t, ok: false, status: 0, reason: "timeout" } : null));
    expect(await run(store, net.send, MORNING)).toMatchObject({ thoughts: 0, failed: 1 });
    expect(store.log.size).toBe(1);
    lost = false;
    expect(await run(store, net.send, new Date(MORNING.getTime() + 3600_000))).toMatchObject({ thoughts: 0 });
    expect(net.sent).toHaveLength(1);
    // Every notification carries a per-day collapse id, so a phone shows a repeat only once.
    expect(net.sent[0].collapseId).toBe("berripop-thought-2026-11-12");
    expect(isRetryable({ token, ok: false, status: 0, reason: "timeout" })).toBe(false);
    expect(isRetryable({ token, ok: false, status: 0, reason: "network" })).toBe(false);
    expect(isRetryable({ token, ok: false, status: 429, reason: "TooManyRequests" })).toBe(true);
    expect(isRetryable({ token, ok: false, status: 410, reason: "Unregistered" })).toBe(false);
  });

  it("expires each notification at the phone's local midnight at the latest", async () => {
    const store = memoryStore([phone({ remindHour: 22 })]);
    const { send, sent } = recordingSender();
    const late = new Date("2026-11-12T21:07:00Z"); // 22:07 Budapest
    await run(store, send, late);
    expect(sent[0].expiresAt).toBe(Date.parse("2026-11-12T23:00:00Z") / 1000);
    expect(endOfLocalDay(new Date("2026-07-01T10:30:15Z"), "Europe/Budapest").toISOString()).toBe("2026-07-01T22:00:00.000Z");
    expect(endOfLocalDay(new Date("2026-07-01T10:30:15Z"), "America/New_York").toISOString()).toBe("2026-07-02T04:00:00.000Z");
  });

  it("does not repeat a notification when the phone's time zone changes", async () => {
    // 8:07 in New York on the 12th, then a flight to Tokyo, where 8:07 is already the 13th, ten hours later.
    const store = memoryStore([phone({ timeZone: "America/New_York" })]);
    const { send, sent } = recordingSender();
    expect(await run(store, send, new Date("2026-11-12T13:07:00Z"))).toMatchObject({ thoughts: 1 });
    store.devicesNow = [phone({ timeZone: "Asia/Tokyo" })];
    expect(await run(store, send, new Date("2026-11-12T23:07:00Z"))).toMatchObject({ thoughts: 0 });
    // The next Tokyo morning is a normal day again.
    expect(await run(store, send, new Date("2026-11-13T23:07:00Z"))).toMatchObject({ thoughts: 1 });
    expect(sent).toHaveLength(2);
    expect(MIN_GAP_HOURS).toBeGreaterThanOrEqual(12);
  });

  it("reaches a member once a day even with phones in different time zones", async () => {
    const store = memoryStore([phone({ timeZone: "Asia/Tokyo" }), phone({ token: "b".repeat(64), timeZone: "Europe/Budapest" })]);
    const { send, sent } = recordingSender();
    expect(await run(store, send, new Date("2026-11-11T23:07:00Z"))).toMatchObject({ thoughts: 1 }); // 8:07 Tokyo
    expect(await run(store, send, MORNING)).toMatchObject({ thoughts: 0 }); // 8:07 Budapest, eight hours later
    expect(sent.flatMap(s => s.tokens)).toEqual(["a".repeat(64)]);
  });

  it("survives a sender that throws, and logs counts only", async () => {
    const store = memoryStore([phone()]);
    const logs: [string, Record<string, number>][] = [];
    const r = await run(store, async () => { throw new Error("boom"); }, MORNING, (m, c) => logs.push([m, c]));
    expect(r).toMatchObject({ thoughts: 0, failed: 1 });
    // Nothing left this server, so the day is freed for a later run.
    expect(store.log.size).toBe(0);
    expect(logs[0][1]).toEqual({ "0:not_sent": 1 });
    expect(failureSummary([{ token, ok: false, status: 429, reason: "TooManyRequests" }, { token, ok: true, status: 200 }])).toEqual({ "429:TooManyRequests": 1 });
  });

  it("personalizes only from areas and mood, and only when the member allows it", async () => {
    const inputs: ThoughtInputs = { areas: new Map([["u1", ["relationships"]]]), moods: new Map([["u1", "sad"]]) };
    const on = memoryStore([phone()], { inputs });
    const a = recordingSender();
    await run(on, a.send, MORNING);
    expect(on.calls.thoughtInputs).toEqual([["u1"]]);
    const picked = allThoughts().find(t => t.hu === a.sent[0].body)!;
    expect(picked.moods).toContain("sad");

    const off = memoryStore([phone({ personalize: false })], { inputs });
    const b = recordingSender();
    await run(off, b.send, MORNING);
    expect(off.calls.thoughtInputs).toEqual([]);
    expect(b.sent[0].body).toBe(generalThought("2026-11-12").hu);
  });

  it("drops old send-log rows", async () => {
    const store = memoryStore([]);
    store.log.set(sentKey("thought", "u1", "2026-11-01"), new Date("2026-11-01T07:00:00Z"));
    store.log.set(sentKey("thought", "u1", "2026-11-11"), new Date("2026-11-11T07:00:00Z"));
    await run(store, recordingSender().send, MORNING);
    expect([...store.log.keys()]).toEqual([sentKey("thought", "u1", "2026-11-11")]);
  });
});

describe("privacy: the notification system never touches written content", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const server = read("lib/server/push.ts");
  const pure = ["lib/push/job.ts", "lib/push/schedule.ts", "lib/push/thoughts.ts", "lib/push/reminder.ts"].map(read);

  it("selects no journal text, AI reflection, answer, note or other written field", () => {
    const forbidden = [
      /journalEntries\.body/, /journalReflections/, /journalMoods/, /growthInsights/, /thoughtSessions/, /growthGoals/, /aiCalls/,
      /answers\.(text|reflection|reflectionPrompt)/, /dailyCheckins\.(note|aiReply|topics|need)/,
      /worldMoments\.(note|ownWords|words|promptId)/, /growthSteps\.title/, /customQuestions/, /exportJournal/,
    ];
    for (const re of forbidden) expect(server).not.toMatch(re);
    // The assessment is read only for the picked areas, inside the database.
    const uses = server.match(/pathAssessments\.answers[^`]*/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^pathAssessments\.answers\} ->>? 'areas?'$/);
  });

  it("keeps the scheduling, picking and texts free of any database access", () => {
    for (const src of pure) {
      expect(src).not.toMatch(/from "\.\.\/db/);
      expect(src).not.toMatch(/from "\.\.\/server/);
    }
  });

  it("passes nothing personal through the cron call or its answer", () => {
    const workflow = read(".github/workflows/push-hourly.yml");
    expect(workflow).not.toMatch(/--data|-d |\?/);
    const route = read("app/api/cron/reminders/route.ts");
    expect(route).not.toMatch(/searchParams|req\.json|req\.text/);
    expect(route).toContain("Bearer ${secret}");
  });
});

describe("Apple push client", () => {
  it("stays off until the key, key id and team id are all set", () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T" })).toBeNull();
    const c = apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_PRIVATE_KEY: "a\\nb" });
    expect(c).toMatchObject({ bundleId: "com.berripop.app", production: false, privateKey: "a\nb" });
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_PRIVATE_KEY: "x", APNS_ENV: "production" })?.production).toBe(true);
  });

  it("signs a valid ES256 provider token", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = providerToken({ keyId: "KEY123", teamId: "TEAM456", privateKey: pem, bundleId: "x", production: false }, 1_700_000_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM456", iat: 1_700_000_000 });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("forgets only devices that are gone for good", () => {
    expect(isDeadToken({ token, ok: false, status: 410 })).toBe(true);
    expect(isDeadToken({ token, ok: false, status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(isDeadToken({ token, ok: false, status: 429, reason: "TooManyRequests" })).toBe(false);
    expect(isDeadToken({ token, ok: false, status: 0, reason: "timeout" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, thoughtPeriodKey, thoughtPeriodResets, type Tier } from "../lib/billing/plans";
import { memoryQuota } from "./helpers/memory-quota";
import { runAiCall, type GenerateFn } from "../lib/ai/run";
import { buildMap, chooseViewpoints, parseStart, parseSummary, parseTurn } from "../lib/thought/ai";
import { THOUGHT_COPY } from "../lib/thought/copy";
import * as core from "../lib/thought/core";
import type { ThoughtDeps, ThoughtEvent, ThoughtRow, ThoughtStore } from "../lib/thought/core";

/*
 * Gondolatboncoló rules with an in-memory database and a fake AI generator,
 * run through the real runAiCall (reserve, refund, parse). No database, no AI
 * service, no network.
 */

const PROBLEM = "A barátaim elmentek hétvégén egy programra, és engem nem hívtak. Azóta ezen gondolkodom.";
const ANSWER = "Arra gondoltam, hogy biztos direkt nem hívtak.";
const KEY = "startkey_000001";

const startJson = (vps = ["own", "facts", "alternatives", "next"]) => JSON.stringify({ viewpoints: vps, reply: "Köszönöm, hogy elmondtad.", question: "Mi volt az első gondolatod?", safety: false });
const turnJson = (done = false, safety = false) => JSON.stringify({ reply: "Értem.", question: "És mit tudsz biztosan?", viewpointDone: done, safety });
const summaryJson = JSON.stringify({
  center: "Nem hívtak el", known: ["Elmentek nélküled."], feel: ["szomorúság"], assume: ["Direkt volt."], alternatives: ["Kis program volt."],
  consider: ["Egy eseményből általánosítasz."], nextSteps: ["Rákérdezni nyugodtan."], open: ["Mit jelentene, ha véletlen volt?"], safety: false,
});

/** Answers by request kind; `fail` makes the next N calls throw a provider error. */
function fakeAi() {
  const ai = { calls: [] as { feature: string; prompt: string }[], fail: 0, start: startJson(), turn: turnJson(), summary: summaryJson };
  const generate: GenerateFn = async req => {
    if (ai.fail > 0) { ai.fail--; throw Object.assign(new Error("boom"), { name: "AI_APICallError", statusCode: 500, isRetryable: false }); }
    const kind = req.instructions.includes("summarise a guided") ? "summary" : req.instructions.includes("Pick the") ? "start" : req.instructions.includes("look at short summaries") ? "patterns" : "turn";
    ai.calls.push({ feature: kind, prompt: req.prompt });
    const text = kind === "start" ? ai.start : kind === "summary" ? ai.summary : kind === "patterns" ? JSON.stringify({ observations: ["Lehet, hogy ez visszatér."] }) : ai.turn;
    return { text, usage: { inputTokens: 100, outputTokens: 50 } };
  };
  return { ai, generate };
}

function memoryStore() {
  const rows = new Map<string, ThoughtRow & { locked: boolean }>();
  let n = 0;
  const own = (userId: string, id: string) => { const r = rows.get(id); return r && r.userId === userId ? r : null; };
  const store: ThoughtStore = {
    async findByStartKey(userId, key) { return [...rows.values()].find(r => r.userId === userId && r.startKey === key) ?? null; },
    async insertDraft(row) {
      if ([...rows.values()].some(r => r.userId === row.userId && r.startKey === row.startKey)) return null;
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const now = new Date();
      const r = { ...row, id, savedEntryId: null, status: "draft" as const, messages: [], viewpoints: [], done: [], summary: null, map: null, aiTurns: 0, quotaPeriod: null, createdAt: now, updatedAt: now, locked: false };
      rows.set(id, r);
      return { ...r };
    },
    async get(userId, id) { const r = own(userId, id); return r ? structuredClone(r) : null; },
    async transition(userId, id, from, to) { const r = own(userId, id); if (!r || !from.includes(r.status)) return false; r.status = to; return true; },
    async lock(userId, id) { const r = own(userId, id); if (!r || r.locked) return false; r.locked = true; return true; },
    async unlock(userId, id) { const r = own(userId, id); if (r) r.locked = false; },
    async update(userId, id, patch) { const r = own(userId, id); if (r) Object.assign(r, structuredClone(patch), { updatedAt: new Date() }); },
    async reserveTurn(userId, id, keep) { const r = own(userId, id); if (!r || r.aiTurns >= r.turnLimit - keep) return false; r.aiTurns++; return true; },
    async releaseTurn(userId, id) { const r = own(userId, id); if (r && r.aiTurns > 0) r.aiTurns--; },
    async remove(userId, id) { return !!own(userId, id) && rows.delete(id); },
    async list(userId) { return [...rows.values()].filter(r => r.userId === userId && r.status !== "draft"); },
    async recentSummaries(userId) { return [...rows.values()].filter(r => r.userId === userId && r.status === "completed" && r.summary).map(r => r.summary!); },
  };
  return { store, rows };
}

function setup(opts: { plan?: Tier; consent?: boolean; now?: Date } = {}) {
  const { ai, generate } = fakeAi();
  const mem = memoryStore();
  const events: { userId: string; event: ThoughtEvent }[] = [];
  const entries = new Map<string, { id: string; userId: string; body: string }>([["e-1", { id: "e-1", userId: "u1", body: "Mai bejegyzés a barátaimról." }]]);
  const created: { userId: string; body: string }[] = [];
  const clock = { now: opts.now ?? new Date("2026-11-08T10:00:00Z") };
  const plans: Record<string, Tier> = { u1: opts.plan ?? "free", u2: "free" };
  const quota = memoryQuota(userId => plans[userId] ?? "free", () => clock.now);
  const deps: ThoughtDeps = {
    store: mem.store,
    plan: async userId => { const tier = plans[userId] ?? "free"; return { plan: tier === "trial" ? "free" : tier, limits: PLAN_LIMITS[tier] }; },
    aiReady: async () => (opts.consent === false ? "ai_consent_required" : "ok"),
    ai: (_userId, req, slot) => runAiCall({ ...req, model: "openai/gpt-5-mini" }, { generate, reserve: slot.reserve, release: slot.release, record: async () => {}, sleep: async () => {} }),
    allowanceSlot: () => ({ reserve: async () => true, release: async () => {} }),
    track: async (userId, event) => { events.push({ userId, event }); },
    ownEntry: async (userId, id) => { const e = entries.get(id); return e && e.userId === userId ? { id: e.id, body: e.body } : null; },
    createEntry: async (userId, body) => { created.push({ userId, body }); return `entry-${created.length}`; },
    sessionQuota: {
      async reserve(userId, sessionId) {
        const key = `session:${sessionId}`;
        const r = quota.reserve(userId, "thought", key);
        const held = r.ok ? r.reservation : r.reason === "duplicate" ? quota.find(userId, "thought", key) : null;
        return held ? { ok: true, period: held.period, release: async () => quota.release(userId, held.id) } : { ok: false };
      },
      async usage(userId) { const u = quota.usage(userId, "thought"); return { used: u.used, limit: u.limit, remaining: u.remaining, resets: u.resets }; },
    },
    now: () => clock.now,
  };
  return { deps, ai, mem, events, created, clock, plans, quota };
}

const labels = THOUGHT_COPY.hu.save.labels;
const start = (deps: ThoughtDeps, key = KEY, userId = "u1", extra: { journalEntryId?: string } = {}) => core.startSession(deps, userId, { startKey: key, problem: PROBLEM, ...extra }, "hu");

/** Answers until every viewpoint is done. */
async function finish(deps: ThoughtDeps, id: string) {
  for (let i = 0; i < 12; i++) {
    const s = await core.getSession(deps, "u1", id);
    if (!s.ok || !s.data.current) return;
    await core.replyToSession(deps, "u1", id, { answer: ANSWER }, "hu");
  }
}

describe("allowance (Free: one session for the account's lifetime; trial week: one more; paid: monthly)", () => {
  it("1: Free starts the first session, then has none left, with no monthly reset", async () => {
    const t = setup();
    expect(await core.quota(t.deps, "u1")).toEqual({ used: 0, limit: 1, remaining: 1, resets: null });
    expect((await start(t.deps, "key_aaaaaaaa1")).ok).toBe(true);
    expect(await core.quota(t.deps, "u1")).toEqual({ used: 1, limit: 1, remaining: 0, resets: null });
  });

  it("2: the free session never comes back: not next month, not next year", async () => {
    const t = setup();
    await start(t.deps, "key_aaaaaaaa1");
    for (const at of ["2026-12-01T08:00:00Z", "2027-06-01T08:00:00Z"]) {
      t.clock.now = new Date(at);
      expect(await start(t.deps, `key_${at.slice(0, 7).replace("-", "")}x`)).toEqual({ ok: false, error: "quota_exhausted" });
    }
  });

  it("3: refused before any AI call, and quota_exhausted is tracked", async () => {
    const t = setup();
    await start(t.deps, "key_aaaaaaaa1");
    const calls = t.ai.calls.length;
    expect(await start(t.deps, "key_aaaaaaaa2")).toEqual({ ok: false, error: "quota_exhausted" });
    expect(t.ai.calls.length).toBe(calls);
    expect(t.events.map(e => e.event)).toContain("thought_dissector_quota_exhausted");
  });

  it("4a: the trial week gives exactly one more session on top of the first, charged to separate one-time pools", async () => {
    const t = setup({ plan: "trial" });
    expect((await start(t.deps, "key_aaaaaaaa1")).ok).toBe(true);
    expect((await start(t.deps, "key_aaaaaaaa2")).ok).toBe(true);
    expect(await start(t.deps, "key_aaaaaaaa3")).toEqual({ ok: false, error: "quota_exhausted" });
    expect(t.quota.rows.map(r => r.period).sort()).toEqual(["once:first", "once:trial"]);
    // After the trial: back on Free, the first session is used, nothing new.
    t.plans.u1 = "free";
    expect(await core.quota(t.deps, "u1")).toMatchObject({ remaining: 0 });
    expect(await start(t.deps, "key_aaaaaaaa4")).toEqual({ ok: false, error: "quota_exhausted" });
  });

  it("4b: a free session used before the trial leaves exactly the trial's one", async () => {
    const t = setup();
    await start(t.deps, "key_aaaaaaaa1");
    t.plans.u1 = "trial";
    expect(await core.quota(t.deps, "u1")).toMatchObject({ used: 1, limit: 2, remaining: 1 });
    expect((await start(t.deps, "key_aaaaaaaa2")).ok).toBe(true);
    expect(await start(t.deps, "key_aaaaaaaa3")).toEqual({ ok: false, error: "quota_exhausted" });
  });

  it("4c: a trial week left unused keeps the first free session for later", async () => {
    const t = setup({ plan: "trial" });
    t.plans.u1 = "free";
    expect((await start(t.deps, "key_aaaaaaaa1")).ok).toBe(true);
    expect(await start(t.deps, "key_aaaaaaaa2")).toEqual({ ok: false, error: "quota_exhausted" });
  });

  it("4d: paid plans get a monthly number that opens again in a new calendar month (Budapest time)", async () => {
    const t = setup({ plan: "premium", now: new Date("2026-11-30T23:30:00Z") }); // 00:30 on 1 December in Budapest
    expect(thoughtPeriodKey(t.clock.now)).toBe("2026-12");
    const limit = PLAN_LIMITS.premium.thoughtSessions;
    for (let i = 0; i < limit; i++) expect((await start(t.deps, `key_month${String(i).padStart(4, "0")}`)).ok).toBe(true);
    expect(await start(t.deps, "key_aaaaaaaa9")).toEqual({ ok: false, error: "quota_exhausted" });
    t.clock.now = new Date("2027-01-01T08:00:00Z");
    expect((await start(t.deps, "key_bbbbbbbb1")).ok).toBe(true);
    expect(thoughtPeriodResets(new Date("2026-12-15T12:00:00Z"))).toBe("2027-01-01");
  });

  it("5: Premium gets all six viewpoints and a larger allowance", async () => {
    const t = setup({ plan: "premium" });
    const r = await start(t.deps);
    expect(r.ok && r.data.viewpoints).toEqual(["own", "other", "facts", "beneath", "alternatives", "next"]);
    expect(PLAN_LIMITS.premium.thoughtSessions).toBeGreaterThan(PLAN_LIMITS.free.thoughtSessions);
    expect(PLAN_LIMITS.premium.thoughtWindow).toBe("month");
    expect(PLAN_LIMITS.free.thoughtWindow).toBe("once");
    expect(PLAN_LIMITS.free.thoughtViewpoints).toBeLessThanOrEqual(4);
  });
});

describe("access", () => {
  it("6: without AI consent nothing is stored, charged or sent", async () => {
    const t = setup({ consent: false });
    expect(await start(t.deps)).toEqual({ ok: false, error: "ai_consent_required" });
    expect(t.mem.rows.size).toBe(0);
    expect(t.ai.calls.length).toBe(0);
    expect(await core.quota(t.deps, "u1")).toMatchObject({ used: 0 });
  });

  it("7: another member's session is never found (read, answer, summary, save, delete)", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    expect(await core.getSession(t.deps, "u2", id)).toEqual({ ok: false, error: "not_found" });
    expect(await core.replyToSession(t.deps, "u2", id, { answer: ANSWER }, "hu")).toEqual({ ok: false, error: "not_found" });
    expect(await core.summarizeSession(t.deps, "u2", id, "hu")).toEqual({ ok: false, error: "not_found" });
    expect(await core.saveToJournal(t.deps, "u2", id, { summary: true }, labels)).toEqual({ ok: false, error: "not_found" });
    expect(await core.deleteSession(t.deps, "u2", id)).toEqual({ ok: false, error: "not_found" });
    expect(t.mem.rows.size).toBe(1);
  });

  it("rejects a malformed start key or a too short problem", async () => {
    const t = setup();
    expect(await core.startSession(t.deps, "u1", { startKey: "x", problem: PROBLEM }, "hu")).toEqual({ ok: false, error: "invalid" });
    expect(await core.startSession(t.deps, "u1", { startKey: KEY, problem: "a" }, "hu")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("idempotent start", () => {
  it("8: a double click or two concurrent requests start one session and charge once", async () => {
    const t = setup();
    const [a, b] = await Promise.all([start(t.deps), start(t.deps)]);
    const oks = [a, b].filter(r => r.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    for (const r of [a, b]) if (!r.ok) expect(r.error).toBe("busy");
    expect(t.mem.rows.size).toBe(1);
    expect(t.ai.calls.filter(c => c.feature === "start").length).toBe(1);
    expect((await core.quota(t.deps, "u1")).used).toBe(1);
    // Asking again later returns the same session, still charged once.
    const again = await start(t.deps);
    expect(again.ok && again.data.id).toBe(oks[0].ok && oks[0].data.id);
    expect((await core.quota(t.deps, "u1")).used).toBe(1);
  });

  it("9: a failed first AI call charges nothing, keeps a draft and can be retried with the same key", async () => {
    const t = setup();
    t.ai.fail = 1;
    expect(await start(t.deps)).toEqual({ ok: false, error: "ai_unavailable" });
    expect((await core.quota(t.deps, "u1")).used).toBe(0);
    expect([...t.mem.rows.values()][0]).toMatchObject({ status: "draft", aiTurns: 0 });
    const retry = await start(t.deps);
    expect(retry.ok).toBe(true);
    expect(t.mem.rows.size).toBe(1);
    expect((await core.quota(t.deps, "u1")).used).toBe(1);
  });

  it("an unparseable first reply also charges nothing", async () => {
    const t = setup();
    t.ai.start = "not json";
    expect((await start(t.deps)).ok).toBe(false);
    expect((await core.quota(t.deps, "u1")).used).toBe(0);
  });
});

describe("the conversation", () => {
  it("10: when the AI fails mid-way the answer is kept, and retrying does not duplicate it", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    t.ai.fail = 1;
    expect(await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu")).toEqual({ ok: false, error: "ai_unavailable" });
    let s = await core.getSession(t.deps, "u1", id);
    expect(s.ok && s.data.messages.at(-1)).toMatchObject({ role: "user", text: ANSWER });
    expect(s.ok && s.data.messages.length).toBe(3);
    const retry = await core.replyToSession(t.deps, "u1", id, {}, "hu");
    expect(retry.ok).toBe(true);
    s = await core.getSession(t.deps, "u1", id);
    expect(s.ok && s.data.messages.filter(m => m.text === ANSWER).length).toBe(1);
    expect(s.ok && s.data.messages.at(-1)?.role).toBe("berri");
    expect([...t.mem.rows.values()][0].aiTurns).toBe(2); // the failed call was given back
  });

  it("11: a paused session continues later without using another monthly session", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu");
    await core.clientEvent(t.deps, "u1", "thought_dissector_abandoned");
    const used = (await core.quota(t.deps, "u1")).used;
    const later = await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu");
    expect(later.ok).toBe(true);
    expect((await core.quota(t.deps, "u1")).used).toBe(used);
    expect(t.events.map(e => e.event)).toContain("thought_dissector_abandoned");
  });

  it("Free moves one viewpoint per answer, then offers the summary; a skip needs no AI call on the last one", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    for (let i = 0; i < 3; i++) await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu");
    const calls = t.ai.calls.length;
    const last = await core.replyToSession(t.deps, "u1", id, { skip: true }, "hu");
    expect(t.ai.calls.length).toBe(calls);
    expect(last.ok && last.data).toMatchObject({ current: null, readyForSummary: true, done: ["own", "facts", "alternatives", "next"] });
  });

  it("the per-session turn cap holds back one turn for the summary", async () => {
    const t = setup({ plan: "premium" });
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    let res;
    for (let i = 0; i < 40; i++) {
      res = await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu");
      if (!res.ok) break;
    }
    const row = [...t.mem.rows.values()][0];
    expect(row.aiTurns).toBeLessThanOrEqual(row.turnLimit - 1);
    expect((await core.summarizeSession(t.deps, "u1", id, "hu")).ok).toBe(true);
    expect([...t.mem.rows.values()][0].aiTurns).toBeLessThanOrEqual(row.turnLimit);
  });

  it("a second request while one turn runs is told to wait", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    const [a, b] = await Promise.all([
      core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu"),
      core.replyToSession(t.deps, "u1", id, { answer: "Más válasz" }, "hu"),
    ]);
    expect([a, b].filter(x => !x.ok).map(x => !x.ok && x.error)).toEqual(["busy"]);
  });
});

describe("journal", () => {
  it("12: starting from a journal entry links it; someone else's entry is refused", async () => {
    const t = setup();
    const r = await start(t.deps, KEY, "u1", { journalEntryId: "e-1" });
    expect(r.ok && r.data.journalEntryId).toBe("e-1");
    expect(await start(t.deps, "key_bbbbbbbb", "u2", { journalEntryId: "e-1" })).toEqual({ ok: false, error: "not_found" });
  });

  it("13: the result reaches the journal only on request, once, with the chosen parts", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    await finish(t.deps, id);
    const sum = await core.summarizeSession(t.deps, "u1", id, "hu");
    expect(sum.ok && sum.data.status).toBe("completed");
    expect(t.created).toEqual([]);
    expect(await core.saveToJournal(t.deps, "u1", id, {}, labels)).toEqual({ ok: false, error: "invalid" });
    const saved = await core.saveToJournal(t.deps, "u1", id, { summary: true, map: true }, labels);
    expect(saved).toEqual({ ok: true, data: { entryId: "entry-1" } });
    expect(t.created[0].body).toContain("Amit biztosan tudunk");
    expect(t.created[0].body).toContain("Gondolattérkép");
    expect(t.created[0].body).not.toContain(ANSWER); // no transcript unless chosen
    await core.saveToJournal(t.deps, "u1", id, { transcript: true }, labels);
    expect(t.created.length).toBe(1);
  });

  it("14: a session can be deleted by its owner", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    expect(await core.deleteSession(t.deps, "u1", id)).toEqual({ ok: true, data: undefined });
    expect(await core.getSession(t.deps, "u1", id)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("safety and privacy", () => {
  it("15: a crisis signal in the problem stops before anything is stored, charged or sent", async () => {
    const t = setup();
    const r = await core.startSession(t.deps, "u1", { startKey: KEY, problem: "Néha arra gondolok, hogy megölöm magam." }, "hu");
    expect(r).toEqual({ ok: false, error: "invalid", safety: true });
    expect(t.mem.rows.size).toBe(0);
    expect(t.ai.calls.length).toBe(0);
  });

  it("a crisis signal in an answer stops the session without another AI call", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    const calls = t.ai.calls.length;
    const res = await core.replyToSession(t.deps, "u1", id, { answer: "Nem akarok élni." }, "hu");
    expect(res.ok && res.safety).toBe(true);
    expect(res.ok && res.data.status).toBe("safety_stop");
    expect(t.ai.calls.length).toBe(calls);
    expect(await core.replyToSession(t.deps, "u1", id, { answer: ANSWER }, "hu")).toEqual({ ok: false, error: "invalid" });
  });

  it("the model's safety flag stops the session too", async () => {
    const t = setup();
    t.ai.start = JSON.stringify({ viewpoints: ["own"], reply: "Itt vagyok.", question: "Hogy vagy most?", safety: true });
    const r = await start(t.deps);
    expect(r.ok && r.safety).toBe(true);
    expect(r.ok && r.data.status).toBe("safety_stop");
  });

  it("16: analytics receive event names only, never text", async () => {
    const t = setup();
    const r = await start(t.deps);
    const id = r.ok ? r.data.id : "";
    await finish(t.deps, id);
    await core.summarizeSession(t.deps, "u1", id, "hu");
    await core.saveToJournal(t.deps, "u1", id, { summary: true }, labels);
    await core.clientEvent(t.deps, "u1", "thought_dissector_opened");
    await core.clientEvent(t.deps, "u1", "anything else");
    const names = t.events.map(e => e.event);
    expect(new Set(names)).toEqual(new Set([
      "thought_dissector_started", "thought_dissector_message_sent", "thought_dissector_viewpoint_completed",
      "thought_dissector_completed", "thought_dissector_saved_to_journal", "thought_dissector_opened",
    ]));
    for (const e of t.events) expect(Object.keys(e).sort()).toEqual(["event", "userId"]);
  });

  it("Premium patterns need an explicit opt-in for each request", async () => {
    const t = setup({ plan: "premium" });
    expect(await core.findPatterns(t.deps, "u1", false, "hu")).toEqual({ ok: false, error: "invalid" });
    const free = setup();
    expect(await core.findPatterns(free.deps, "u1", true, "hu")).toEqual({ ok: false, error: "premium_required" });
  });
});

describe("parsing", () => {
  it("chooses 3–4 valid viewpoints for Free in a fixed order, all six for Premium", () => {
    expect(chooseViewpoints(["alternatives", "own", "bogus", "facts"], 4)).toEqual(["own", "facts", "alternatives", "next"]);
    expect(chooseViewpoints([], 4)).toHaveLength(4);
    expect(chooseViewpoints(["own", "other", "facts", "beneath", "alternatives", "next"], 4)).toHaveLength(4);
    expect(chooseViewpoints(null, 6)).toHaveLength(6);
  });

  it("rejects malformed or oversized responses", () => {
    expect(parseStart("nope", 4)).toBeNull();
    expect(parseStart(JSON.stringify({ reply: "x".repeat(700), question: "?" }), 4)).toBeNull();
    expect(parseTurn(JSON.stringify({ reply: "ok", question: "" }), false)).toBeNull();
    expect(parseTurn(JSON.stringify({ reply: "ok", question: "" }), true)).toMatchObject({ viewpointDone: true });
    expect(parseSummary(JSON.stringify({ known: ["a"] }))).toBeNull();
    expect(parseSummary("```json\n" + summaryJson + "\n```")).not.toBeNull();
  });

  it("builds a basic map for Free and a detailed one for Premium", () => {
    const s = parseSummary(summaryJson)!.summary;
    expect(buildMap(s, "x", false).branches.map(b => b.id)).toEqual(["feelings", "facts", "assumptions", "alternatives"]);
    expect(buildMap(s, "x", true).branches).toHaveLength(6);
  });
});

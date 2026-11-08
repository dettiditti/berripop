import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiUsage, journalEntries, thoughtSessions } from "../db/schema";
import { thoughtPeriodKey, thoughtPeriodResets } from "../billing/plans";
import { isLocale, type Locale } from "../i18n/config";
import { THOUGHT_COPY } from "../thought/copy";
import * as core from "../thought/core";
import type { ThoughtDeps, ThoughtRow, ThoughtStore } from "../thought/core";
import type { ThoughtResult, ThoughtSessionDTO, ThoughtState } from "../thought/types";
import { track } from "./analytics";
import { aiConfigured, runSlottedAi } from "./ai";
import { consumeAiAllowance, getUserEntitlements, refundAiAllowance } from "./entitlements";
import { saveEntry } from "./journal";
import { aiAllowedFor } from "./legal";

/*
 * Gondolatboncoló on the real database and AI Gateway. The rules live in
 * lib/thought/core.ts; this file only supplies the storage and services.
 * Every query filters by the owner's id. Text is never logged or tracked.
 *
 * Off unless THOUGHT_DISSECTOR_ENABLED=1, so the code can ship before the
 * thought_sessions migration (drizzle/0011) has been run.
 */

export const thoughtEnabled = () => process.env.THOUGHT_DISSECTOR_ENABLED === "1";

/** One turn at a time; a lock older than this is treated as abandoned (e.g. a crashed request). */
const LOCK_SECONDS = 90;

const T = thoughtSessions;

const toRow = (r: typeof T.$inferSelect): ThoughtRow => ({
  id: r.id, userId: r.userId, journalEntryId: r.journalEntryId, savedEntryId: r.savedEntryId, startKey: r.startKey,
  status: r.status, problem: r.problem, messages: Array.isArray(r.messages) ? r.messages : [],
  viewpoints: Array.isArray(r.viewpoints) ? r.viewpoints : [], done: Array.isArray(r.done) ? r.done : [],
  summary: r.summary ?? null, map: r.map ?? null, plan: r.plan, aiTurns: r.aiTurns, turnLimit: r.turnLimit,
  quotaPeriod: r.quotaPeriod, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

const own = (userId: string, id: string) => and(eq(T.id, id), eq(T.userId, userId));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const store: ThoughtStore = {
  async findByStartKey(userId, startKey) {
    const [r] = await getDb().select().from(T).where(and(eq(T.userId, userId), eq(T.startKey, startKey))).limit(1);
    return r ? toRow(r) : null;
  },
  async insertDraft(row) {
    const [r] = await getDb().insert(T).values({ ...row, status: "draft" }).onConflictDoNothing({ target: [T.userId, T.startKey] }).returning();
    return r ? toRow(r) : null;
  },
  async get(userId, id) {
    if (!UUID.test(id)) return null;
    const [r] = await getDb().select().from(T).where(own(userId, id)).limit(1);
    return r ? toRow(r) : null;
  },
  async transition(userId, id, from, to) {
    const res = await getDb().update(T).set({ status: to, updatedAt: new Date() })
      .where(and(own(userId, id), sql`${T.status} in (${sql.join(from.map(f => sql`${f}`), sql`, `)})`)).returning({ id: T.id });
    return res.length > 0;
  },
  async lock(userId, id) {
    const res = await getDb().update(T).set({ lockedUntil: sql`now() + make_interval(secs => ${LOCK_SECONDS})` })
      .where(and(own(userId, id), sql`(${T.lockedUntil} is null or ${T.lockedUntil} < now())`)).returning({ id: T.id });
    return res.length > 0;
  },
  async unlock(userId, id) {
    await getDb().update(T).set({ lockedUntil: null }).where(own(userId, id));
  },
  async update(userId, id, patch) {
    await getDb().update(T).set({ ...patch, updatedAt: new Date() }).where(own(userId, id));
  },
  async reserveTurn(userId, id, keep) {
    const res = await getDb().update(T).set({ aiTurns: sql`${T.aiTurns} + 1` })
      .where(and(own(userId, id), sql`${T.aiTurns} < ${T.turnLimit} - ${keep}`)).returning({ id: T.id });
    return res.length > 0;
  },
  async releaseTurn(userId, id) {
    await getDb().update(T).set({ aiTurns: sql`${T.aiTurns} - 1` }).where(and(own(userId, id), sql`${T.aiTurns} > 0`));
  },
  async remove(userId, id) {
    if (!UUID.test(id)) return false;
    return (await getDb().delete(T).where(own(userId, id)).returning({ id: T.id })).length > 0;
  },
  async list(userId) {
    const rows = await getDb().select().from(T).where(and(eq(T.userId, userId), sql`${T.status} <> 'draft'`)).orderBy(desc(T.updatedAt)).limit(30);
    return rows.map(toRow);
  },
  async recentSummaries(userId, limit) {
    const rows = await getDb().select({ summary: T.summary }).from(T)
      .where(and(eq(T.userId, userId), eq(T.status, "completed"), isNotNull(T.summary))).orderBy(desc(T.updatedAt)).limit(limit);
    return rows.flatMap(r => (r.summary ? [r.summary] : []));
  },
  // The monthly allowance shares the ai_usage table with a "thought:YYYY-MM" period.
  async consumeMonthly(userId, period, limit) {
    if (limit <= 0) return false;
    const res = await getDb().execute(sql`
      insert into ai_usage (user_id, period, count) values (${userId}, ${`thought:${period}`}, 1)
      on conflict (user_id, period) do update set count = ai_usage.count + 1
      where ai_usage.count < ${limit}
      returning count`);
    return res.rows.length > 0;
  },
  async refundMonthly(userId, period) {
    await getDb().execute(sql`update ai_usage set count = count - 1 where user_id = ${userId} and period = ${`thought:${period}`} and count > 0`);
  },
  async usedMonthly(userId, period) {
    const [r] = await getDb().select({ count: aiUsage.count }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.period, `thought:${period}`))).limit(1);
    return r?.count ?? 0;
  },
};

const deps: ThoughtDeps = {
  store,
  plan: async userId => {
    const ent = await getUserEntitlements(userId);
    return { plan: ent.plan, limits: ent.limits };
  },
  aiReady: async userId => (!aiConfigured() ? "ai_unavailable" : (await aiAllowedFor(userId)) ? "ok" : "ai_consent_required"),
  ai: (userId, req, slot) => runSlottedAi(userId, req, slot),
  allowanceSlot: userId => {
    const now = new Date();
    return { reserve: () => consumeAiAllowance(userId, now, "journal"), release: () => refundAiAllowance(userId, now, "journal") };
  },
  track: (userId, event) => track(userId, event, { context: "thought" }),
  ownEntry: async (userId, entryId) => {
    if (!UUID.test(entryId)) return null;
    const [e] = await getDb().select({ id: journalEntries.id, body: journalEntries.body, status: journalEntries.status }).from(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId))).limit(1);
    return e && e.status === "saved" ? { id: e.id, body: e.body } : null;
  },
  createEntry: async (userId, body) => {
    const res = await saveEntry(userId, { body, status: "saved" });
    if (!res.ok || !res.data) throw new Error("journal_save_failed");
    return res.data;
  },
  period: thoughtPeriodKey,
  now: () => new Date(),
};

const loc = (l: string): Locale => (isLocale(l) ? l : "hu");
const off = <T,>(): ThoughtResult<T> => ({ ok: false, error: "disabled" });

export async function loadThoughtState(userId: string): Promise<ThoughtState> {
  const ent = await getUserEntitlements(userId);
  const base = { enabled: thoughtEnabled(), aiConfigured: aiConfigured(), plan: ent.plan, deep: ent.limits.thoughtDeep, viewpointCount: ent.limits.thoughtViewpoints };
  const now = new Date();
  if (!base.enabled) return { ...base, quota: { used: 0, limit: ent.limits.thoughtSessionsPerMonth, remaining: 0, resets: thoughtPeriodResets(now) }, sessions: [] };
  const [q, rows] = await Promise.all([core.quota(deps, userId), store.list(userId)]);
  return { ...base, quota: { ...q, resets: thoughtPeriodResets(now) }, sessions: rows.map(core.toListItem) };
}

export const startThought = (userId: string, input: { startKey: unknown; problem: unknown; journalEntryId?: unknown }, locale: string) =>
  thoughtEnabled() ? core.startSession(deps, userId, input, loc(locale)) : off<ThoughtSessionDTO>();
export const replyThought = (userId: string, id: string, input: { answer?: unknown; skip?: unknown }, locale: string) =>
  thoughtEnabled() ? core.replyToSession(deps, userId, id, input, loc(locale)) : off<ThoughtSessionDTO>();
export const summarizeThought = (userId: string, id: string, locale: string) =>
  thoughtEnabled() ? core.summarizeSession(deps, userId, id, loc(locale)) : off<ThoughtSessionDTO>();
export const continueThought = (userId: string, id: string) => (thoughtEnabled() ? core.continueSession(deps, userId, id) : off<ThoughtSessionDTO>());
export const getThought = (userId: string, id: string) => (thoughtEnabled() ? core.getSession(deps, userId, id) : off<ThoughtSessionDTO>());
export const deleteThought = (userId: string, id: string): Promise<ThoughtResult> => (thoughtEnabled() ? core.deleteSession(deps, userId, id) : Promise.resolve(off<undefined>()));
export const thoughtPatterns = (userId: string, optIn: unknown, locale: string) =>
  thoughtEnabled() ? core.findPatterns(deps, userId, optIn, loc(locale)) : off<string[]>();
export const saveThoughtToJournal = (userId: string, id: string, parts: core.SaveParts, locale: string) =>
  thoughtEnabled() ? core.saveToJournal(deps, userId, id, parts, THOUGHT_COPY[loc(locale)].save.labels) : off<{ entryId: string }>();
export async function thoughtClientEvent(userId: string, event: unknown) {
  if (thoughtEnabled()) await core.clientEvent(deps, userId, event);
}

/** For the account export: every session with its text (the owner's own data). Works with the feature off too, once the table exists. */
export async function exportThoughts(userId: string) {
  try {
    const rows = await getDb().select().from(T).where(eq(T.userId, userId)).orderBy(desc(T.createdAt));
    return rows.map(r => ({ status: r.status, problem: r.problem, messages: r.messages, summary: r.summary, map: r.map, createdAt: r.createdAt, updatedAt: r.updatedAt }));
  } catch (err) {
    // Before the migration has run the table does not exist (42P01): nothing to export. Anything else is a real error.
    if ((err as { code?: unknown; cause?: { code?: unknown } })?.code === "42P01" || (err as { cause?: { code?: unknown } })?.cause?.code === "42P01") return [];
    throw err;
  }
}

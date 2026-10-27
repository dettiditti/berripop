import "server-only";
import { crisisSignal } from "../safety/crisis";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { growthGoals, growthInsights, journalEntries, journalReflections } from "../db/schema";
import { grantGrowthXp } from "./progress";
import { circleToday } from "../domain/rules";
import { dictionaries } from "../i18n/dictionaries";
import { isLocale, type Locale } from "../i18n/config";
import { INSIGHT_KINDS, isSupportMode, parseReflection, parseWeekly, type InsightKind, type SupportMode } from "../journal/reflection";
import type { JournalError, JournalReflectionDTO, JournalResult, JournalState, WeeklyJournalDTO } from "../journal/types";
import { track } from "./analytics";
import { aiConfigured, runMeteredAi } from "./ai";
import { canAccessWeeklyJournal, getAiUsage, getUserEntitlements } from "./entitlements";

/*
 * Daily journal. Every query filters by the authenticated owner's id, so no
 * other user (including circle members) can read, change or delete an entry.
 * Journal text is never logged or sent to analytics; AI calls log token counts only.
 */

const MAX_BODY = 20000;
const fail = (error: JournalError) => ({ ok: false as const, error });

export { aiConfigured };

export async function loadJournal(userId: string): Promise<JournalState> {
  const db = getDb();
  const [entries, reflections, insights, usage, ent] = await Promise.all([
    db.select().from(journalEntries).where(eq(journalEntries.userId, userId)).orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt)),
    db.select().from(journalReflections).where(eq(journalReflections.userId, userId)).orderBy(desc(journalReflections.createdAt)),
    db.select().from(growthInsights).where(eq(growthInsights.userId, userId)).orderBy(desc(growthInsights.updatedAt)),
    getAiUsage(userId, new Date(), "journal"),
    getUserEntitlements(userId),
  ]);
  return {
    entries: entries.map(e => ({ id: e.id, body: e.body, status: e.status, entryDate: e.entryDate, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })),
    reflections: reflections.map(toReflectionDTO),
    insights: insights.map(i => ({ id: i.id, kind: i.kind, text: i.text, goalId: i.goalId, sourceEntryId: i.sourceEntryId, origin: i.origin, updatedAt: i.updatedAt.toISOString() })),
    usage,
    weeklyJournal: ent.limits.weeklyJournal,
    insightContext: ent.limits.insightContext,
    aiConfigured: aiConfigured(),
  };
}

function toReflectionDTO(r: typeof journalReflections.$inferSelect): JournalReflectionDTO {
  const kind = INSIGHT_KINDS.includes(r.suggestionKind as InsightKind) ? (r.suggestionKind as InsightKind) : null;
  return {
    id: r.id,
    entryId: r.entryId,
    noticed: r.noticed,
    strength: r.strength,
    explore: r.explore,
    nextStep: r.nextStep,
    alternatives: Array.isArray(r.alternatives) ? r.alternatives : [],
    mode: isSupportMode(r.mode) ? r.mode : null,
    suggestion: kind && r.suggestionText ? { kind, text: r.suggestionText, goalId: r.suggestionGoalId } : null,
    feedback: r.feedback,
    correction: r.correction,
    createdAt: r.createdAt.toISOString(),
  };
}

async function ownEntry(userId: string, entryId: string) {
  const [e] = await getDb().select().from(journalEntries).where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId))).limit(1);
  return e ?? null;
}

const ok = async <T,>(userId: string, data?: T): Promise<JournalResult<T>> => ({ ok: true, state: await loadJournal(userId), data });

/* ---------- Entries ---------- */

/** Creates or updates the owner's entry. Drafts autosave; "saved" marks it complete. */
export async function saveEntry(userId: string, input: { id?: string | null; body: string; status: "draft" | "saved" }): Promise<JournalResult<string>> {
  const body = input.body.slice(0, MAX_BODY);
  const status = input.status === "saved" ? "saved" : "draft";
  if (status === "saved" && body.trim().length < 3) return fail("invalid");
  const db = getDb();
  // Funnel: the first completed entry is the first exercise (event name only, never text).
  const firstSaved = status === "saved"
    && (await db.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.userId, userId), eq(journalEntries.status, "saved"))).limit(1)).length === 0;
  if (input.id) {
    const existing = await ownEntry(userId, input.id);
    if (!existing) return fail("not_found");
    await db.update(journalEntries).set({ body, status, updatedAt: new Date() }).where(eq(journalEntries.id, existing.id));
    if (firstSaved) await track(userId, "first_entry_saved");
    if (status === "saved") await grantGrowthXp(userId, "journal", existing.id);
    return ok(userId, existing.id);
  }
  const [row] = await db.insert(journalEntries).values({ userId, body, status, entryDate: circleToday() }).returning({ id: journalEntries.id });
  if (firstSaved) await track(userId, "first_entry_saved");
  // XP for saving (once per entry, within the daily cap). The text is never read for it.
  if (status === "saved") await grantGrowthXp(userId, "journal", row.id);
  return ok(userId, row.id);
}

export async function deleteEntry(userId: string, entryId: string): Promise<JournalResult> {
  if (!(await ownEntry(userId, entryId))) return fail("not_found");
  // Reflections cascade; insights keep the text the user approved but lose the link.
  await getDb().delete(journalEntries).where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)));
  return ok(userId);
}

/* ---------- AI reflection ---------- */

/** One metered AI call on the "journal" allowance; an unparseable response is refunded (see lib/server/ai.ts). */
async function runAi<T>(userId: string, feature: string, instructions: string, prompt: string, maxOutputTokens: number, parse: (text: string) => T | null) {
  const out = await runMeteredAi(userId, "journal", { feature, instructions, prompt, maxOutputTokens, parse });
  if (!out.ok && out.reason === "limit") await track(userId, "ai_allowance_reached", { context: "journal" });
  return out;
}

/**
 * Reflects on one saved entry, only when the owner asks. Context is minimal:
 * this entry and the owner's active goal titles. Saved insights are added only
 * when the owner ticks the opt-in for this request (Premium). Other entries are
 * never included. `mode` is the support the owner asked for (default: reflect).
 */
export async function reflectOnEntry(userId: string, entryId: string, localeInput: string, useInsights = false, modeInput: unknown = "reflect"): Promise<JournalResult<{ reflectionId: string; safety: boolean }>> {
  const mode: SupportMode = isSupportMode(modeInput) ? modeInput : "reflect";
  const entry = await ownEntry(userId, entryId);
  if (!entry) return fail("not_found");
  if (entry.status !== "saved" || entry.body.trim().length < 3) return fail("invalid");
  const locale: Locale = isLocale(localeInput) ? localeInput : "hu";
  const db = getDb();
  const ent = await getUserEntitlements(userId);
  const goals = await db.select({ id: growthGoals.id, title: growthGoals.title }).from(growthGoals).where(and(eq(growthGoals.userId, userId), eq(growthGoals.status, "active")));
  const insights = useInsights === true && ent.limits.insightContext
    ? await db.select({ kind: growthInsights.kind, text: growthInsights.text }).from(growthInsights).where(eq(growthInsights.userId, userId)).orderBy(desc(growthInsights.updatedAt)).limit(8)
    : [];
  const prompt = [
    goals.length ? `Goals (id: title):\n${goals.map(g => `${g.id}: ${g.title}`).join("\n")}` : "Goals: none",
    insights.length ? `Insights they approved earlier:\n${insights.map(i => `- (${i.kind}) ${i.text}`).join("\n")}` : "",
    `Journal entry:\n${entry.body}`,
  ].filter(Boolean).join("\n\n");

  const ai = dictionaries[locale].journal.ai;
  const out = await runAi(userId, "journal_reflection", `${ai.reflectInstructions} ${ai.modes[mode]}`, prompt, 1000, text => parseReflection(text, goals.map(g => g.id)));
  if (!out.ok) return fail(out.error);
  const parsed = out.value;
  const firstReflection = (await db.select({ id: journalReflections.id }).from(journalReflections).where(eq(journalReflections.userId, userId)).limit(1)).length === 0;
  const [row] = await db.insert(journalReflections).values({
    entryId: entry.id,
    userId,
    noticed: parsed.noticed,
    strength: parsed.strength,
    explore: parsed.explore,
    nextStep: parsed.nextStep,
    alternatives: parsed.alternatives,
    mode,
    suggestionKind: parsed.suggestion?.kind ?? null,
    suggestionText: parsed.suggestion?.text ?? null,
    suggestionGoalId: parsed.suggestion?.goalId ?? null,
  }).returning({ id: journalReflections.id });
  if (firstReflection) await track(userId, "first_reflection_received");
  // The safety card shows when either the model or the keyword check raises it; neither is stored.
  return ok(userId, { reflectionId: row.id, safety: parsed.safety || crisisSignal(entry.body) });
}

export async function reflectionFeedback(userId: string, reflectionId: string, feedback: "helpful" | "not_helpful", correction?: string): Promise<JournalResult> {
  const db = getDb();
  const [r] = await db.select({ id: journalReflections.id }).from(journalReflections).where(and(eq(journalReflections.id, reflectionId), eq(journalReflections.userId, userId))).limit(1);
  if (!r) return fail("not_found");
  await db.update(journalReflections).set({ feedback, correction: correction?.trim().slice(0, 1000) || null }).where(eq(journalReflections.id, r.id));
  return ok(userId);
}

/* ---------- Insights (only ever saved on explicit confirmation) ---------- */

export async function saveInsight(userId: string, input: { kind: string; text: string; goalId?: string | null; sourceEntryId?: string | null; origin: "user" | "ai_suggested" }): Promise<JournalResult> {
  const text = input.text.trim().slice(0, 300);
  if (!text || !INSIGHT_KINDS.includes(input.kind as InsightKind)) return fail("invalid");
  const db = getDb();
  let goalId: string | null = null;
  if (input.goalId) {
    const [g] = await db.select({ id: growthGoals.id }).from(growthGoals).where(and(eq(growthGoals.id, input.goalId), eq(growthGoals.userId, userId))).limit(1);
    goalId = g?.id ?? null;
  }
  let sourceEntryId: string | null = null;
  if (input.sourceEntryId) sourceEntryId = (await ownEntry(userId, input.sourceEntryId))?.id ?? null;
  await db.insert(growthInsights).values({ userId, kind: input.kind as InsightKind, text, goalId, sourceEntryId, origin: input.origin === "ai_suggested" ? "ai_suggested" : "user" });
  return ok(userId);
}

export async function updateInsight(userId: string, insightId: string, text: string): Promise<JournalResult> {
  const clean = text.trim().slice(0, 300);
  if (!clean) return fail("invalid");
  const db = getDb();
  const res = await db.update(growthInsights).set({ text: clean, updatedAt: new Date() }).where(and(eq(growthInsights.id, insightId), eq(growthInsights.userId, userId))).returning({ id: growthInsights.id });
  if (!res.length) return fail("not_found");
  return ok(userId);
}

export async function deleteInsight(userId: string, insightId: string): Promise<JournalResult> {
  const res = await getDb().delete(growthInsights).where(and(eq(growthInsights.id, insightId), eq(growthInsights.userId, userId))).returning({ id: growthInsights.id });
  if (!res.length) return fail("not_found");
  return ok(userId);
}

/* ---------- Weekly reflection (Premium), export, delete all ---------- */

/**
 * Not stored: generated on request; the owner chooses which proposals to keep.
 * Saved insights are included only when the owner opts in for this request.
 */
export async function weeklyJournal(userId: string, localeInput: string, useInsights = false): Promise<{ ok: true; weekly: WeeklyJournalDTO; state: JournalState } | { ok: false; error: JournalError }> {
  if (!(await canAccessWeeklyJournal(userId))) {
    await track(userId, "premium_feature_requested", { context: "journal" });
    return fail("premium_required");
  }
  const locale: Locale = isLocale(localeInput) ? localeInput : "hu";
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const entries = await db
    .select({ date: journalEntries.entryDate, body: journalEntries.body })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.status, "saved"), gte(journalEntries.createdAt, since)))
    .orderBy(desc(journalEntries.createdAt))
    .limit(14);
  if (!entries.length) return fail("invalid");
  const insights = useInsights === true
    ? await db.select({ kind: growthInsights.kind, text: growthInsights.text }).from(growthInsights).where(eq(growthInsights.userId, userId)).orderBy(desc(growthInsights.updatedAt)).limit(10)
    : [];
  const prompt = [
    insights.length ? `Saved insights:\n${insights.map(i => `- (${i.kind}) ${i.text}`).join("\n")}` : "",
    entries.map(e => `[${e.date}]\n${e.body.slice(0, 3000)}`).join("\n\n"),
  ].filter(Boolean).join("\n\n");
  const out = await runAi(userId, "journal_weekly", dictionaries[locale].journal.ai.weeklyInstructions, prompt, 1300, parseWeekly);
  if (!out.ok) return fail(out.error);
  return { ok: true, weekly: out.value, state: await loadJournal(userId) };
}

/** Everything the owner has in the journal, for download. */
export async function exportJournal(userId: string) {
  const state = await loadJournal(userId);
  return { exportedAt: new Date().toISOString(), entries: state.entries, reflections: state.reflections, insights: state.insights };
}

export async function deleteAllJournal(userId: string): Promise<JournalResult> {
  const db = getDb();
  const ids = (await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.userId, userId))).map(r => r.id);
  await db.delete(growthInsights).where(eq(growthInsights.userId, userId));
  if (ids.length) await db.delete(journalEntries).where(and(eq(journalEntries.userId, userId), inArray(journalEntries.id, ids)));
  return ok(userId);
}

import { crisisSignal } from "../safety/crisis";
import type { AiOutcome } from "../ai/run";
import type { Locale } from "../i18n/config";
import {
  attachmentReflectionPrompt, loveReflectionPrompt, MAX_OUTPUT, parseReflection, parseTranslation, parseTriggerInsight,
  parseSummary, reflectionInstructions, summaryInstructions, summaryPrompt, translateInstructions, translatePrompt,
  triggerInstructions, triggerPrompt, type Safety,
} from "./ai";
import { RELATIONSHIP_COPY } from "./copy";
import type { RelationshipKind, RelationshipRecordData, RelationshipRecordInsight, SummaryStats } from "./records";
import {
  attachmentDetail, growthWeeks, isoWeek, loveLanguageDetail, retestFrom, scoreAttachment, scoreLoveLanguages, triggerPatterns,
  validAttachmentAnswers, validLoveAnswers, weeklyQuestion,
} from "./scoring";
import {
  isFeeling, isReaction, isTranslateWho, NEEDS,
  type AttachmentRecordDTO, type LoveLanguageRecordDTO, type RelationshipError, type RelationshipReflection, type RelationshipResult,
  type GrowthState, type RelationshipState, type SummaryRecordDTO, type TranslationRecordDTO, type TriggerInput, type TriggerInsight,
  type TriggerRecordDTO, type WeeklySummary,
} from "./types";

/*
 * Kapcsolati világ rules, independent of the database and the AI provider
 * (both injected), so tests run them in memory. Every rule that decides what
 * a member may do lives here, on the server side: the UI only shows it.
 *
 * - Test scoring is deterministic and free for everyone.
 * - Premium (a paid plan or the running trial) unlocks the detailed analyses,
 *   AI reflections and the trigger map; checked here, never trusted from the client.
 * - The translator is Premium, with one free try per account (PLAN_QUOTAS.relationship).
 * - Texts that look like a crisis never go to the AI; the safety card is shown instead.
 * - Each test can be taken again once a month (RETEST_DAYS); earlier results are kept for comparison.
 * - The growth path is Premium; its weekly AI summary is made only on request, at most once a week,
 *   from counts and labels (never the member's own text), and it uses the weekly AI allowance.
 */

export type StoredRow = { id: string; kind: RelationshipKind; data: RelationshipRecordData; insight: RelationshipRecordInsight | null; createdAt: Date };

export type RelationshipStore = {
  latest(userId: string, kind: RelationshipKind): Promise<StoredRow | null>;
  list(userId: string, kind: RelationshipKind, limit: number): Promise<StoredRow[]>;
  get(userId: string, id: string): Promise<StoredRow | null>;
  insert(userId: string, data: RelationshipRecordData, insight: RelationshipRecordInsight | null): Promise<StoredRow>;
  setInsight(userId: string, id: string, insight: RelationshipRecordInsight): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  removeAll(userId: string): Promise<void>;
};

export type AiAsk<T> = { feature: string; instructions: string; prompt: string; maxOutputTokens: number; parse: (text: string) => T | null };

export type RelationshipDeps = {
  enabled: () => boolean;
  aiConfigured: () => boolean;
  store: RelationshipStore;
  access: (userId: string) => Promise<{ premium: boolean; plan: string; tier: string }>;
  quota: (userId: string) => Promise<RelationshipState["quota"]>;
  /** One metered AI call against the "relationship" allowance (reserved before, given back on failure). */
  ai: <T>(userId: string, ask: AiAsk<T>) => Promise<AiOutcome<T>>;
  /** The current time (tests set it). */
  now?: () => Date;
};

export const LIMITS = { triggers: 30, translations: 10, translationsCounted: 40, summaries: 12, situation: 800, thought: 500, note: 300, original: 600 } as const;

const DAY = 86_400_000;
const now = (deps: RelationshipDeps) => (deps.now ? deps.now() : new Date());

const fail = (error: RelationshipError): { ok: false; error: RelationshipError } => ({ ok: false, error });

const iso = (d: Date) => d.toISOString();

function loveDTO(row: StoredRow, premium: boolean): LoveLanguageRecordDTO | null {
  if (row.data.kind !== "love_language") return null;
  const result = scoreLoveLanguages(row.data.receive, row.data.give);
  return { id: row.id, createdAt: iso(row.createdAt), result, detail: premium ? loveLanguageDetail(result) : null, reflection: (row.insight as RelationshipReflection | null) ?? null };
}

function attachmentDTO(row: StoredRow, premium: boolean): AttachmentRecordDTO | null {
  if (row.data.kind !== "attachment") return null;
  return { id: row.id, createdAt: iso(row.createdAt), result: scoreAttachment(row.data.answers), detail: premium ? attachmentDetail(row.data.answers) : null, reflection: (row.insight as RelationshipReflection | null) ?? null };
}

function triggerDTO(row: StoredRow): TriggerRecordDTO | null {
  if (row.data.kind !== "trigger") return null;
  return { id: row.id, createdAt: iso(row.createdAt), input: row.data.input, insight: (row.insight as TriggerInsight | null) ?? null };
}

function translationDTO(row: StoredRow): TranslationRecordDTO | null {
  if (row.data.kind !== "translation") return null;
  return { id: row.id, createdAt: iso(row.createdAt), original: row.data.original, who: row.data.who, result: row.data.result };
}

function summaryDTO(row: StoredRow): SummaryRecordDTO | null {
  if (row.data.kind !== "summary" || !row.insight) return null;
  return { id: row.id, createdAt: iso(row.createdAt), week: row.data.week, summary: row.insight as WeeklySummary };
}

const nonNull = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

function growthState(at: Date, rows: { love: StoredRow[]; attach: StoredRow[]; triggers: StoredRow[]; translations: StoredRow[]; summaries: StoredRow[] }): GrowthState {
  const week = isoWeek(at);
  const love = rows.love[0] ? loveDTO(rows.love[0], true) : null;
  const attach = rows.attach[0] ? attachmentDTO(rows.attach[0], true) : null;
  const triggers = nonNull(rows.triggers.map(triggerDTO));
  const summaries = nonNull(rows.summaries.map(summaryDTO));
  const weekAgo = at.getTime() - 7 * DAY;
  const prevLove = rows.love[1] ? loveDTO(rows.love[1], false) : null;
  const prevAttach = rows.attach[1] ? attachmentDTO(rows.attach[1], false) : null;
  return {
    week,
    question: weeklyQuestion(week, love?.result.top[0] ?? null, attach?.result.main ?? null),
    weeks: growthWeeks(
      at,
      triggers.map(t => ({ at: new Date(t.createdAt), feelings: t.input.feelings, needs: t.insight?.needs ?? [] })),
      rows.translations.map(t => ({ at: t.createdAt })),
    ),
    summaries,
    doneThisWeek: summaries.some(x => x.week === week),
    hasActivity: rows.triggers.some(r => r.createdAt.getTime() >= weekAgo) || rows.translations.some(r => r.createdAt.getTime() >= weekAgo),
    previousLove: prevLove ? { createdAt: prevLove.createdAt, result: prevLove.result } : null,
    previousAttachment: prevAttach ? { createdAt: prevAttach.createdAt, result: prevAttach.result } : null,
  };
}

export async function loadState(deps: RelationshipDeps, userId: string): Promise<RelationshipState> {
  const access = await deps.access(userId);
  const quota = await deps.quota(userId);
  const base = { enabled: deps.enabled(), aiConfigured: deps.aiConfigured(), premium: access.premium, plan: access.plan, tier: access.tier, quota };
  if (!base.enabled) return { ...base, loveLanguage: null, attachment: null, triggers: [], patterns: null, translations: [], freeTranslationLeft: false, retest: { love: null, attachment: null }, growth: null };
  const [loves, attaches, triggers, translations, summaries] = await Promise.all([
    deps.store.list(userId, "love_language", 2),
    deps.store.list(userId, "attachment", 2),
    deps.store.list(userId, "trigger", LIMITS.triggers),
    deps.store.list(userId, "translation", LIMITS.translationsCounted),
    access.premium ? deps.store.list(userId, "summary", LIMITS.summaries) : Promise.resolve([]),
  ]);
  const love = loves[0] ?? null;
  const attach = attaches[0] ?? null;
  const at = now(deps);
  const triggerDTOs = nonNull(triggers.map(triggerDTO));
  return {
    ...base,
    loveLanguage: love ? loveDTO(love, access.premium) : null,
    attachment: attach ? attachmentDTO(attach, access.premium) : null,
    // The member's own entries stay visible after a plan ends; only new ones need Premium.
    triggers: triggerDTOs,
    patterns: access.premium ? triggerPatterns(triggerDTOs.map(t => ({ feelings: t.input.feelings, reactions: t.input.reactions, needs: t.insight?.needs ?? [] }))) : null,
    translations: nonNull(translations.slice(0, LIMITS.translations).map(translationDTO)),
    freeTranslationLeft: !access.premium && quota.remaining > 0,
    retest: { love: retestFrom(love?.createdAt ?? null, at), attachment: retestFrom(attach?.createdAt ?? null, at) },
    growth: access.premium ? growthState(at, { love: loves, attach: attaches, triggers, translations, summaries }) : null,
  };
}

async function withState<T>(deps: RelationshipDeps, userId: string, data: T): Promise<RelationshipResult<T>> {
  return { ok: true, data, state: await loadState(deps, userId) };
}

/* ---------- Tests (free for everyone) ---------- */

export async function saveLoveLanguage(deps: RelationshipDeps, userId: string, input: { receive?: unknown; give?: unknown }): Promise<RelationshipResult<{ id: string }>> {
  if (!deps.enabled()) return fail("disabled");
  if (!validLoveAnswers(input.receive, input.give)) return fail("invalid");
  if (retestFrom((await deps.store.latest(userId, "love_language"))?.createdAt ?? null, now(deps))) return fail("too_soon");
  const row = await deps.store.insert(userId, { v: 1, kind: "love_language", receive: input.receive, give: input.give as typeof input.receive }, null);
  return withState(deps, userId, { id: row.id });
}

export async function saveAttachment(deps: RelationshipDeps, userId: string, input: { answers?: unknown }): Promise<RelationshipResult<{ id: string }>> {
  if (!deps.enabled()) return fail("disabled");
  if (!validAttachmentAnswers(input.answers)) return fail("invalid");
  if (retestFrom((await deps.store.latest(userId, "attachment"))?.createdAt ?? null, now(deps))) return fail("too_soon");
  const row = await deps.store.insert(userId, { v: 1, kind: "attachment", answers: input.answers }, null);
  return withState(deps, userId, { id: row.id });
}

/* ---------- AI (Premium) ---------- */

/** Maps an AI outcome to the result the member sees; a safety flag from the AI is handled like a crisis signal. */
function aiError<T>(out: AiOutcome<Safety<T>>): RelationshipError | null {
  if (out.ok) return out.value.safety ? "safety" : null;
  if (out.error === "limit_ai") return "limit_ai";
  if (out.error === "ai_consent_required") return "ai_consent_required";
  if (out.error === "ai_unavailable" && out.reason !== "duplicate") return "ai_unavailable";
  return "ai_failed";
}

async function gate(deps: RelationshipDeps, userId: string, needsPremium: boolean): Promise<RelationshipError | null> {
  if (!deps.enabled()) return "disabled";
  if (!deps.aiConfigured()) return "ai_unavailable";
  if (needsPremium && !(await deps.access(userId)).premium) return "premium_required";
  return null;
}

/** A personal AI reflection on the member's own test result. Asked again, the saved one is returned (no new charge). */
export async function reflect(deps: RelationshipDeps, userId: string, recordId: unknown, locale: Locale): Promise<RelationshipResult<RelationshipReflection>> {
  const blocked = await gate(deps, userId, true);
  if (blocked) return fail(blocked);
  if (typeof recordId !== "string") return fail("invalid");
  const row = await deps.store.get(userId, recordId);
  if (!row || (row.data.kind !== "love_language" && row.data.kind !== "attachment")) return fail("not_found");
  if (row.insight) return withState(deps, userId, row.insight as RelationshipReflection);
  let prompt: string;
  if (row.data.kind === "love_language") {
    const r = scoreLoveLanguages(row.data.receive, row.data.give);
    prompt = loveReflectionPrompt(r, loveLanguageDetail(r));
  } else {
    prompt = attachmentReflectionPrompt(scoreAttachment(row.data.answers), attachmentDetail(row.data.answers));
  }
  const out = await deps.ai(userId, { feature: `relationship_reflection_${row.data.kind}`, instructions: reflectionInstructions(locale), prompt, maxOutputTokens: MAX_OUTPUT.reflection, parse: parseReflection });
  const err = aiError(out);
  if (err || !out.ok) return fail(err ?? "ai_failed");
  await deps.store.setInsight(userId, row.id, out.value.value);
  return withState(deps, userId, out.value.value);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanTrigger(input: Record<string, unknown>): TriggerInput | null {
  const situation = text(input.situation, LIMITS.situation);
  const feelings = Array.isArray(input.feelings) ? [...new Set(input.feelings.filter(isFeeling))].slice(0, 4) : [];
  const reactions = Array.isArray(input.reactions) ? [...new Set(input.reactions.filter(isReaction))].slice(0, 4) : [];
  if (situation.length < 3 || feelings.length === 0) return null;
  return { situation, feelings, thought: text(input.thought, LIMITS.thought), reactions, reactionNote: text(input.reactionNote, LIMITS.note) };
}

/** Saves one trigger-map entry with the AI's view of the need behind it. */
export async function analyzeTrigger(deps: RelationshipDeps, userId: string, raw: unknown, locale: Locale): Promise<RelationshipResult<TriggerRecordDTO>> {
  const blocked = await gate(deps, userId, true);
  if (blocked) return fail(blocked);
  const input = raw && typeof raw === "object" ? cleanTrigger(raw as Record<string, unknown>) : null;
  if (!input) return fail("invalid");
  if (crisisSignal(`${input.situation}\n${input.thought}\n${input.reactionNote}`)) return fail("safety");
  const c = RELATIONSHIP_COPY.en;
  const out = await deps.ai(userId, {
    feature: "relationship_trigger",
    instructions: triggerInstructions(locale, NEEDS),
    prompt: triggerPrompt(input, { feelings: input.feelings.map(f => c.feelings[f]), reactions: input.reactions.map(r => c.reactions[r]) }),
    maxOutputTokens: MAX_OUTPUT.trigger,
    parse: parseTriggerInsight,
  });
  const err = aiError(out);
  if (err || !out.ok) return fail(err ?? "ai_failed");
  const row = await deps.store.insert(userId, { v: 1, kind: "trigger", input }, out.value.value);
  return withState(deps, userId, triggerDTO(row)!);
}

/** Rephrases one sentence. Premium, or the one free try on Free (the allowance decides). */
export async function translate(deps: RelationshipDeps, userId: string, raw: { original?: unknown; who?: unknown }, locale: Locale): Promise<RelationshipResult<TranslationRecordDTO>> {
  const blocked = await gate(deps, userId, false);
  if (blocked) return fail(blocked);
  const original = text(raw.original, LIMITS.original);
  const who = isTranslateWho(raw.who) ? raw.who : null;
  if (original.length < 3) return fail("invalid");
  if (crisisSignal(original)) return fail("safety");
  const out = await deps.ai(userId, { feature: "relationship_translate", instructions: translateInstructions(locale), prompt: translatePrompt(original, who), maxOutputTokens: MAX_OUTPUT.translate, parse: parseTranslation });
  const err = aiError(out);
  if (err === "limit_ai" && !(await deps.access(userId)).premium) return fail("premium_required");
  if (err || !out.ok) return fail(err ?? "ai_failed");
  const row = await deps.store.insert(userId, { v: 1, kind: "translation", original, who, result: out.value.value }, null);
  return withState(deps, userId, translationDTO(row)!);
}

/* ---------- Growth path (Premium) ---------- */

const withCounts = (xs: { id: string; count: number }[], label: (id: string) => string) => xs.map(x => `${label(x.id)} ×${x.count}`);

/**
 * The weekly growth summary, on request. One per week: asked again, the saved
 * one is returned without a new charge. Made from the last seven days' counts
 * and labels only, so nothing the member wrote leaves for it.
 */
export async function summarize(deps: RelationshipDeps, userId: string, locale: Locale): Promise<RelationshipResult<SummaryRecordDTO>> {
  const blocked = await gate(deps, userId, true);
  if (blocked) return fail(blocked);
  const at = now(deps);
  const week = isoWeek(at);
  const existing = (await deps.store.list(userId, "summary", LIMITS.summaries)).map(summaryDTO).find(x => x?.week === week);
  if (existing) return withState(deps, userId, existing);
  const [triggers, translations, love, attach] = await Promise.all([
    deps.store.list(userId, "trigger", LIMITS.triggers),
    deps.store.list(userId, "translation", LIMITS.translationsCounted),
    deps.store.latest(userId, "love_language"),
    deps.store.latest(userId, "attachment"),
  ]);
  const t = at.getTime();
  const since = (rows: StoredRow[], from: number, to: number) => rows.filter(r => r.createdAt.getTime() >= from && r.createdAt.getTime() < to);
  const recent = nonNull(since(triggers, t - 7 * DAY, Infinity).map(triggerDTO));
  const recentTranslations = since(translations, t - 7 * DAY, Infinity).length;
  if (recent.length === 0 && recentTranslations === 0) return fail("nothing_yet");
  const c = RELATIONSHIP_COPY.en;
  const p = triggerPatterns(recent.map(e => ({ feelings: e.input.feelings, reactions: e.input.reactions, needs: e.insight?.needs ?? [] })));
  // Counted from all entries this week, not only the repeated ones.
  const all = <K extends string>(lists: K[][]) => {
    const m = new Map<K, number>();
    for (const l of lists) for (const id of new Set(l)) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  };
  const stats: SummaryStats = {
    entries: p.entries,
    translations: recentTranslations,
    feelings: withCounts(all(recent.map(e => e.input.feelings)), id => c.feelings[id as keyof typeof c.feelings]),
    reactions: withCounts(all(recent.map(e => e.input.reactions)), id => c.reactions[id as keyof typeof c.reactions]),
    needs: withCounts(all(recent.map(e => e.insight?.needs ?? [])), id => c.needs[id as keyof typeof c.needs]),
    previousEntries: since(triggers, t - 14 * DAY, t - 7 * DAY).length,
  };
  const loveTop = love?.data.kind === "love_language" ? scoreLoveLanguages(love.data.receive, love.data.give).top[0] : null;
  const attachMain = attach?.data.kind === "attachment" ? scoreAttachment(attach.data.answers).main : null;
  const out = await deps.ai(userId, {
    feature: "relationship_summary",
    instructions: summaryInstructions(locale),
    prompt: summaryPrompt(stats, { love: loveTop ? c.love.langs[loveTop].name : null, attachment: attachMain ? c.attach.patterns[attachMain].name : null }),
    maxOutputTokens: MAX_OUTPUT.summary,
    parse: parseSummary,
  });
  const err = aiError(out);
  if (err || !out.ok) return fail(err ?? "ai_failed");
  const row = await deps.store.insert(userId, { v: 1, kind: "summary", week, stats }, out.value.value);
  return withState(deps, userId, summaryDTO(row)!);
}

/* ---------- The member's data ---------- */

export async function deleteRecord(deps: RelationshipDeps, userId: string, id: unknown): Promise<RelationshipResult> {
  if (!deps.enabled()) return fail("disabled");
  if (typeof id !== "string" || !(await deps.store.remove(userId, id))) return fail("not_found");
  return withState(deps, userId, undefined);
}

export async function deleteAll(deps: RelationshipDeps, userId: string): Promise<RelationshipResult> {
  if (!deps.enabled()) return fail("disabled");
  await deps.store.removeAll(userId);
  return withState(deps, userId, undefined);
}

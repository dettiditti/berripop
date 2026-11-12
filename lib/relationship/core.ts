import { crisisSignal } from "../safety/crisis";
import type { AiOutcome } from "../ai/run";
import type { Locale } from "../i18n/config";
import {
  attachmentReflectionPrompt, loveReflectionPrompt, MAX_OUTPUT, parseReflection, parseTranslation, parseTriggerInsight,
  reflectionInstructions, translateInstructions, translatePrompt, triggerInstructions, triggerPrompt, type Safety,
} from "./ai";
import { RELATIONSHIP_COPY } from "./copy";
import type { RelationshipKind, RelationshipRecordData, RelationshipRecordInsight } from "./records";
import {
  attachmentDetail, loveLanguageDetail, scoreAttachment, scoreLoveLanguages, triggerPatterns, validAttachmentAnswers, validLoveAnswers,
} from "./scoring";
import {
  isFeeling, isReaction, isTranslateWho, NEEDS,
  type AttachmentRecordDTO, type LoveLanguageRecordDTO, type RelationshipError, type RelationshipReflection, type RelationshipResult,
  type RelationshipState, type TranslationRecordDTO, type TriggerInput, type TriggerInsight, type TriggerRecordDTO,
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
};

export const LIMITS = { triggers: 30, translations: 10, situation: 800, thought: 500, note: 300, original: 600 } as const;

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

const nonNull = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

export async function loadState(deps: RelationshipDeps, userId: string): Promise<RelationshipState> {
  const access = await deps.access(userId);
  const quota = await deps.quota(userId);
  const base = { enabled: deps.enabled(), aiConfigured: deps.aiConfigured(), premium: access.premium, plan: access.plan, tier: access.tier, quota };
  if (!base.enabled) return { ...base, loveLanguage: null, attachment: null, triggers: [], patterns: null, translations: [], freeTranslationLeft: false };
  const [love, attach, triggers, translations] = await Promise.all([
    deps.store.latest(userId, "love_language"),
    deps.store.latest(userId, "attachment"),
    deps.store.list(userId, "trigger", LIMITS.triggers),
    deps.store.list(userId, "translation", LIMITS.translations),
  ]);
  const triggerDTOs = nonNull(triggers.map(triggerDTO));
  return {
    ...base,
    loveLanguage: love ? loveDTO(love, access.premium) : null,
    attachment: attach ? attachmentDTO(attach, access.premium) : null,
    // The member's own entries stay visible after a plan ends; only new ones need Premium.
    triggers: triggerDTOs,
    patterns: access.premium ? triggerPatterns(triggerDTOs.map(t => ({ feelings: t.input.feelings, reactions: t.input.reactions, needs: t.insight?.needs ?? [] }))) : null,
    translations: nonNull(translations.map(translationDTO)),
    freeTranslationLeft: !access.premium && quota.remaining > 0,
  };
}

async function withState<T>(deps: RelationshipDeps, userId: string, data: T): Promise<RelationshipResult<T>> {
  return { ok: true, data, state: await loadState(deps, userId) };
}

/* ---------- Tests (free for everyone) ---------- */

export async function saveLoveLanguage(deps: RelationshipDeps, userId: string, input: { receive?: unknown; give?: unknown }): Promise<RelationshipResult<{ id: string }>> {
  if (!deps.enabled()) return fail("disabled");
  if (!validLoveAnswers(input.receive, input.give)) return fail("invalid");
  const row = await deps.store.insert(userId, { v: 1, kind: "love_language", receive: input.receive, give: input.give as typeof input.receive }, null);
  return withState(deps, userId, { id: row.id });
}

export async function saveAttachment(deps: RelationshipDeps, userId: string, input: { answers?: unknown }): Promise<RelationshipResult<{ id: string }>> {
  if (!deps.enabled()) return fail("disabled");
  if (!validAttachmentAnswers(input.answers)) return fail("invalid");
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

import type { AiOutcome } from "../ai/run";
import type { PlanId, PlanLimits } from "../billing/plans";
import { crisisSignal } from "../safety/crisis";
import {
  buildMap, parsePatterns, parseStart, parseSummary, parseTurn, patternsInstructions, patternsPrompt, startInstructions,
  startPrompt, summaryInstructions, summaryPrompt, turnInstructions, turnPrompt,
} from "./ai";
import type {
  ThoughtError, ThoughtListItem, ThoughtMap, ThoughtMessage, ThoughtResult, ThoughtSessionDTO, ThoughtStatus, ThoughtSummary, ViewpointId,
} from "./types";

/*
 * Gondolatboncoló session logic. The database, AI, analytics and journal are
 * injected (lib/server/thought.ts wires the real ones), so every rule here is
 * covered by unit tests with in-memory fakes.
 *
 * Rules:
 * - Starting is idempotent per `startKey`: a double click, a retried request
 *   or a concurrent one finds the same session and is charged at most once.
 * - One monthly session is used only when Berri's first reply arrives. A
 *   failed start gives it back and leaves a draft that can be retried.
 * - Continuing a session never uses a monthly session. Each AI call counts
 *   against the session's turn cap; one turn is kept for the summary.
 * - The member's answer is stored before the AI call, so a failure never
 *   loses it; retrying answers the stored message instead of sending it again.
 * - A crisis signal (keyword check or the model's flag) stops the session and
 *   shows the safety card; nothing more is sent to the AI for it.
 * - Analytics get event names only, never text.
 */

export type ThoughtRow = {
  id: string;
  userId: string;
  journalEntryId: string | null;
  savedEntryId: string | null;
  startKey: string;
  status: ThoughtStatus;
  problem: string;
  messages: ThoughtMessage[];
  viewpoints: ViewpointId[];
  done: ViewpointId[];
  summary: ThoughtSummary | null;
  map: ThoughtMap | null;
  plan: string;
  aiTurns: number;
  turnLimit: number;
  quotaPeriod: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ThoughtPatch = Partial<Pick<ThoughtRow, "status" | "messages" | "viewpoints" | "done" | "summary" | "map" | "quotaPeriod" | "savedEntryId" | "plan" | "turnLimit">>;

export type ThoughtStore = {
  findByStartKey(userId: string, startKey: string): Promise<ThoughtRow | null>;
  /** Inserts a draft; null when (userId, startKey) already exists. */
  insertDraft(row: { userId: string; startKey: string; problem: string; journalEntryId: string | null; plan: string; turnLimit: number }): Promise<ThoughtRow | null>;
  get(userId: string, id: string): Promise<ThoughtRow | null>;
  /** Atomic status change; false when the session is not in one of `from`. */
  transition(userId: string, id: string, from: ThoughtStatus[], to: ThoughtStatus): Promise<boolean>;
  /** Atomic lock so only one turn runs at a time (expires on its own after a while). */
  lock(userId: string, id: string): Promise<boolean>;
  unlock(userId: string, id: string): Promise<void>;
  update(userId: string, id: string, patch: ThoughtPatch): Promise<void>;
  /** Atomically counts one AI turn while `ai_turns < turn_limit - keep`. */
  reserveTurn(userId: string, id: string, keep: number): Promise<boolean>;
  releaseTurn(userId: string, id: string): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  list(userId: string): Promise<ThoughtRow[]>;
  /** Summaries of the member's latest completed sessions (for Premium patterns). */
  recentSummaries(userId: string, limit: number): Promise<ThoughtSummary[]>;
  /** Monthly allowance (one atomic conditional upsert in the real store). */
  consumeMonthly(userId: string, period: string, limit: number): Promise<boolean>;
  refundMonthly(userId: string, period: string): Promise<void>;
  usedMonthly(userId: string, period: string): Promise<number>;
};

export type ThoughtEvent =
  | "thought_dissector_opened" | "thought_dissector_started" | "thought_dissector_viewpoint_completed" | "thought_dissector_message_sent"
  | "thought_dissector_completed" | "thought_dissector_abandoned" | "thought_dissector_saved_to_journal" | "thought_dissector_quota_exhausted"
  | "thought_dissector_premium_clicked";

export type AiSlot = { reserve: () => Promise<boolean>; release: () => Promise<void> };
export type AiCall = <T>(userId: string, req: { feature: string; instructions: string; prompt: string; maxOutputTokens: number; parse: (t: string) => T | null }, slot: AiSlot) => Promise<AiOutcome<T>>;

export type ThoughtDeps = {
  store: ThoughtStore;
  plan: (userId: string) => Promise<{ plan: PlanId; limits: PlanLimits }>;
  /** Consent and configuration; checked before anything reaches the AI. */
  aiReady: (userId: string) => Promise<"ok" | "ai_unavailable" | "ai_consent_required">;
  ai: AiCall;
  /** The member's weekly journal AI allowance, used for Premium patterns (outside any session). */
  allowanceSlot: (userId: string) => AiSlot;
  track: (userId: string, event: ThoughtEvent) => Promise<void>;
  /** The owner's saved journal entry text, or null when it is not theirs. */
  ownEntry: (userId: string, entryId: string) => Promise<{ id: string; body: string } | null>;
  /** Creates a saved journal entry and returns its id. */
  createEntry: (userId: string, body: string) => Promise<string>;
  period: (now: Date) => string;
  now: () => Date;
};

const MAX_PROBLEM = 4000;
const MAX_ANSWER = 2000;
const START_KEY = /^[A-Za-z0-9_-]{8,64}$/;

const fail = <T,>(error: ThoughtError, safety?: boolean): ThoughtResult<T> => ({ ok: false, error, ...(safety ? { safety } : {}) });

/** How many answers one viewpoint may take before Berri moves on. */
const answersPerViewpoint = (deep: boolean) => (deep ? 3 : 1);

export function toDTO(r: ThoughtRow): ThoughtSessionDTO {
  const current = r.viewpoints.find(v => !r.done.includes(v)) ?? null;
  return {
    id: r.id,
    status: r.status,
    problem: r.problem,
    journalEntryId: r.journalEntryId,
    messages: r.messages,
    viewpoints: r.viewpoints,
    done: r.done,
    current,
    readyForSummary: r.status === "active" && r.messages.length > 1 && (current === null || r.aiTurns >= r.turnLimit - 1),
    turnsLeft: Math.max(0, r.turnLimit - 1 - r.aiTurns),
    summary: r.summary,
    map: r.map,
    savedEntryId: r.savedEntryId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toListItem(r: ThoughtRow): ThoughtListItem {
  const title = r.problem.trim().replace(/\s+/g, " ");
  return {
    id: r.id,
    title: r.map?.center || (title.length > 80 ? `${title.slice(0, 80)}…` : title),
    status: r.status,
    done: r.done.length,
    total: r.viewpoints.length,
    fromEntry: !!r.journalEntryId,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function quota(deps: ThoughtDeps, userId: string) {
  const { limits } = await deps.plan(userId);
  const used = await deps.store.usedMonthly(userId, deps.period(deps.now()));
  const limit = limits.thoughtSessionsPerMonth;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

const at = (deps: ThoughtDeps) => deps.now().toISOString();
const turnSlot = (deps: ThoughtDeps, userId: string, id: string, keep: number): AiSlot => ({
  reserve: () => deps.store.reserveTurn(userId, id, keep),
  release: () => deps.store.releaseTurn(userId, id),
});

/**
 * Starts (or finds) a session. `problem` is the member's text; with
 * `journalEntryId` the session is linked to that entry (which must be theirs).
 */
export async function startSession(deps: ThoughtDeps, userId: string, input: { startKey: unknown; problem: unknown; journalEntryId?: unknown }, locale: string): Promise<ThoughtResult<ThoughtSessionDTO>> {
  const startKey = typeof input.startKey === "string" ? input.startKey : "";
  const problem = typeof input.problem === "string" ? input.problem.trim().slice(0, MAX_PROBLEM) : "";
  if (!START_KEY.test(startKey) || problem.length < 3) return fail("invalid");
  const { store } = deps;

  // The same start, again: hand back what exists (charged at most once).
  let row = await store.findByStartKey(userId, startKey);
  if (row && row.status !== "draft") return row.status === "starting" ? fail("busy") : { ok: true, data: toDTO(row) };

  // Safety first: a crisis signal stops here, before anything is stored, charged or sent to the AI.
  if (crisisSignal(problem)) return fail("invalid", true);

  const ready = await deps.aiReady(userId);
  if (ready !== "ok") return fail(ready);
  const { plan, limits } = await deps.plan(userId);

  if (!row) {
    let journalEntryId: string | null = null;
    if (typeof input.journalEntryId === "string" && input.journalEntryId) {
      const entry = await deps.ownEntry(userId, input.journalEntryId);
      if (!entry) return fail("not_found");
      journalEntryId = entry.id;
    }
    row = await store.insertDraft({ userId, startKey, problem, journalEntryId, plan, turnLimit: limits.thoughtTurnsPerSession })
      ?? await store.findByStartKey(userId, startKey);
    if (!row) return fail("busy");
    if (row.status !== "draft") return row.status === "starting" ? fail("busy") : { ok: true, data: toDTO(row) };
  }

  // Only one request may run the first turn; a concurrent one sees "busy".
  if (!(await store.transition(userId, row.id, ["draft"], "starting"))) return fail("busy");

  const period = deps.period(deps.now());
  if (!(await store.consumeMonthly(userId, period, limits.thoughtSessionsPerMonth))) {
    await store.transition(userId, row.id, ["starting"], "draft");
    await deps.track(userId, "thought_dissector_quota_exhausted");
    return fail("quota_exhausted");
  }

  const out = await deps.ai(userId, {
    feature: "thought_dissector_start",
    instructions: startInstructions(locale, limits.thoughtViewpoints),
    prompt: startPrompt(row.problem),
    maxOutputTokens: limits.thoughtMaxOutputTokens,
    parse: t => parseStart(t, limits.thoughtViewpoints),
  }, turnSlot(deps, userId, row.id, 1));

  if (!out.ok) {
    // Nothing was delivered: the monthly session goes back and the draft stays for a retry.
    await store.refundMonthly(userId, period);
    await store.transition(userId, row.id, ["starting"], "draft");
    return fail(out.error === "limit_ai" ? "turn_limit" : out.error);
  }

  const v = out.value;
  const now = at(deps);
  const messages: ThoughtMessage[] = [
    { role: "user", text: row.problem, viewpoint: null, at: now },
    { role: "berri", text: `${v.reply}\n\n${v.question}`, viewpoint: v.viewpoints[0], at: now },
  ];
  const status: ThoughtStatus = v.safety ? "safety_stop" : "active";
  await store.update(userId, row.id, { messages, viewpoints: v.viewpoints, done: [], quotaPeriod: period, status });
  await deps.track(userId, "thought_dissector_started");
  const fresh = await store.get(userId, row.id);
  return { ok: true, data: toDTO(fresh!), ...(v.safety ? { safety: true } : {}) };
}

/**
 * One step of the conversation. `answer` is the member's reply; `skip` moves
 * past the current viewpoint; with neither, the last stored answer is retried
 * (after a failed AI call).
 */
export async function replyToSession(deps: ThoughtDeps, userId: string, id: string, input: { answer?: unknown; skip?: unknown }, locale: string): Promise<ThoughtResult<ThoughtSessionDTO>> {
  const { store } = deps;
  const row = await store.get(userId, id);
  if (!row) return fail("not_found");
  if (row.status !== "active") return fail("invalid");
  const current = row.viewpoints.find(v => !row.done.includes(v));
  if (!current) return fail("not_ready");

  const answer = typeof input.answer === "string" ? input.answer.trim().slice(0, MAX_ANSWER) : "";
  const skip = input.skip === true;
  const last = row.messages[row.messages.length - 1];
  const retry = !answer && !skip;
  if (retry && last?.role !== "user") return fail("invalid");

  if (!(await store.lock(userId, id))) return fail("busy");
  try {
    let messages = row.messages;
    if (!retry) {
      messages = [...messages, { role: "user", text: skip ? "" : answer, viewpoint: current, at: at(deps), ...(skip ? { skipped: true } : {}) }];
      // Stored before any AI call, so a failure never loses the answer.
      await store.update(userId, id, { messages });
      if (answer) await deps.track(userId, "thought_dissector_message_sent");
    }

    if (!skip && crisisSignal(retry ? last.text : answer)) {
      await store.update(userId, id, { status: "safety_stop" });
      return { ok: true, data: toDTO((await store.get(userId, id))!), safety: true };
    }

    const { limits } = await deps.plan(userId);
    const deep = row.plan !== "free" && limits.thoughtDeep;
    const answered = messages.filter(m => m.role === "user" && m.viewpoint === current).length;
    const advance = skip || answered >= answersPerViewpoint(deep);
    const idx = row.viewpoints.indexOf(current);
    const next = row.viewpoints[idx + 1] ?? null;
    const final = advance && next === null;

    // Skipping the last viewpoint needs no AI call.
    if (skip && final) {
      const done = [...row.done, current];
      await store.update(userId, id, { done });
      await deps.track(userId, "thought_dissector_viewpoint_completed");
      return { ok: true, data: toDTO((await store.get(userId, id))!) };
    }

    const out = await deps.ai(userId, {
      feature: "thought_dissector_turn",
      instructions: turnInstructions(locale, final),
      prompt: turnPrompt({ problem: row.problem, viewpoints: row.viewpoints, done: row.done, current, next, messages, advance }),
      maxOutputTokens: limits.thoughtMaxOutputTokens,
      parse: t => parseTurn(t, final),
    }, turnSlot(deps, userId, id, 1));
    if (!out.ok) return fail(out.error === "limit_ai" ? "turn_limit" : out.error);

    const v = out.value;
    const moveOn = advance || (deep && v.viewpointDone);
    const done = moveOn ? [...row.done, current] : row.done;
    const nextVp = moveOn ? next : current;
    const text = nextVp && v.question ? `${v.reply}\n\n${v.question}` : v.reply;
    messages = [...messages, { role: "berri", text, viewpoint: nextVp, at: at(deps) }];
    await store.update(userId, id, { messages, done, ...(v.safety ? { status: "safety_stop" as const } : {}) });
    if (moveOn) await deps.track(userId, "thought_dissector_viewpoint_completed");
    return { ok: true, data: toDTO((await store.get(userId, id))!), ...(v.safety ? { safety: true } : {}) };
  } finally {
    await store.unlock(userId, id);
  }
}

/** Makes the summary and the mind map (once; asking again returns the stored result). */
export async function summarizeSession(deps: ThoughtDeps, userId: string, id: string, locale: string): Promise<ThoughtResult<ThoughtSessionDTO>> {
  const { store } = deps;
  const row = await store.get(userId, id);
  if (!row) return fail("not_found");
  if (row.status === "completed" && row.summary) return { ok: true, data: toDTO(row) };
  if (row.status !== "active" || row.messages.length < 3) return fail("not_ready");
  if (!(await store.lock(userId, id))) return fail("busy");
  try {
    const { limits } = await deps.plan(userId);
    const deep = row.plan !== "free" && limits.thoughtDeep;
    const out = await deps.ai(userId, {
      feature: "thought_dissector_summary",
      instructions: summaryInstructions(locale),
      prompt: summaryPrompt(row.problem, row.messages),
      maxOutputTokens: limits.thoughtMaxOutputTokens * 2,
      parse: parseSummary,
    }, turnSlot(deps, userId, id, 0));
    if (!out.ok) return fail(out.error === "limit_ai" ? "turn_limit" : out.error);
    const { summary, center, safety } = out.value;
    const map = buildMap(summary, center || toListItem(row).title, deep);
    await store.update(userId, id, { summary, map, status: safety ? "safety_stop" : "completed" });
    await deps.track(userId, "thought_dissector_completed");
    return { ok: true, data: toDTO((await store.get(userId, id))!), ...(safety ? { safety: true } : {}) };
  } finally {
    await store.unlock(userId, id);
  }
}

/** Premium: reopen a finished session for more rounds (never uses a monthly session). */
export async function continueSession(deps: ThoughtDeps, userId: string, id: string): Promise<ThoughtResult<ThoughtSessionDTO>> {
  const { limits } = await deps.plan(userId);
  if (!limits.thoughtDeep) return fail("premium_required");
  const row = await deps.store.get(userId, id);
  if (!row) return fail("not_found");
  if (row.status !== "completed") return fail("invalid");
  if (row.aiTurns >= row.turnLimit - 1) return fail("turn_limit");
  // Another pass over the last viewpoint, with the plan's limits from now on.
  const done = row.done.slice(0, -1);
  await deps.store.update(userId, id, { status: "active", done, summary: null, map: null, plan: row.plan === "free" ? "premium" : row.plan });
  return { ok: true, data: toDTO((await deps.store.get(userId, id))!) };
}

export type SaveParts = { summary?: unknown; map?: unknown; transcript?: unknown };

/** Writes the chosen parts into a new journal entry, only when the member asks (once per session). */
export async function saveToJournal(deps: ThoughtDeps, userId: string, id: string, parts: SaveParts, labels: SaveLabels): Promise<ThoughtResult<{ entryId: string }>> {
  const row = await deps.store.get(userId, id);
  if (!row) return fail("not_found");
  if (!row.summary || !row.map) return fail("not_ready");
  if (row.savedEntryId) return { ok: true, data: { entryId: row.savedEntryId } };
  const want = { summary: parts.summary === true, map: parts.map === true, transcript: parts.transcript === true };
  if (!want.summary && !want.map && !want.transcript) return fail("invalid");
  const body = journalBody(row, want, labels);
  const entryId = await deps.createEntry(userId, body);
  await deps.store.update(userId, id, { savedEntryId: entryId });
  await deps.track(userId, "thought_dissector_saved_to_journal");
  return { ok: true, data: { entryId } };
}

export type SaveLabels = {
  title: string;
  sections: Record<"known" | "feel" | "assume" | "alternatives" | "consider" | "nextSteps" | "open", string>;
  branches: Record<string, string>;
  map: string;
  transcript: string;
  you: string;
  berri: string;
  skipped: string;
};

export function journalBody(row: ThoughtRow, want: { summary: boolean; map: boolean; transcript: boolean }, l: SaveLabels): string {
  const out: string[] = [`${l.title}: ${row.map?.center ?? toListItem(row).title}`];
  if (want.summary && row.summary) {
    for (const k of Object.keys(l.sections) as (keyof SaveLabels["sections"])[]) {
      const items = row.summary[k];
      if (items.length) out.push(`${l.sections[k]}\n${items.map(i => `• ${i}`).join("\n")}`);
    }
  }
  if (want.map && row.map) {
    out.push(`${l.map}\n${row.map.branches.filter(b => b.items.length).map(b => `${l.branches[b.id] ?? b.id}: ${b.items.join(", ")}`).join("\n")}`);
  }
  if (want.transcript) {
    out.push(`${l.transcript}\n${row.messages.map(m => `${m.role === "user" ? l.you : l.berri}: ${m.skipped ? l.skipped : m.text}`).join("\n\n")}`);
  }
  return out.join("\n\n").slice(0, 20000);
}

/** Premium, opt-in per request: possible patterns across the member's finished sessions. Nothing is stored. */
export async function findPatterns(deps: ThoughtDeps, userId: string, optIn: unknown, locale: string): Promise<ThoughtResult<string[]>> {
  if (optIn !== true) return fail("invalid");
  const { limits } = await deps.plan(userId);
  if (!limits.thoughtDeep) return fail("premium_required");
  const ready = await deps.aiReady(userId);
  if (ready !== "ok") return fail(ready);
  const summaries = await deps.store.recentSummaries(userId, 6);
  if (summaries.length < 2) return fail("not_ready");
  const out = await deps.ai(userId, {
    feature: "thought_dissector_patterns",
    instructions: patternsInstructions(locale),
    prompt: patternsPrompt(summaries),
    maxOutputTokens: limits.thoughtMaxOutputTokens,
    parse: parsePatterns,
  }, deps.allowanceSlot(userId));
  if (!out.ok) return fail(out.error);
  return { ok: true, data: out.value };
}

export async function deleteSession(deps: ThoughtDeps, userId: string, id: string): Promise<ThoughtResult> {
  return (await deps.store.remove(userId, id)) ? { ok: true, data: undefined } : fail("not_found");
}

export async function getSession(deps: ThoughtDeps, userId: string, id: string): Promise<ThoughtResult<ThoughtSessionDTO>> {
  const row = await deps.store.get(userId, id);
  return row ? { ok: true, data: toDTO(row) } : fail("not_found");
}

/** Events the client may report (opening, leaving mid-way, the Premium button). Names only. */
const CLIENT_EVENTS = new Set<ThoughtEvent>(["thought_dissector_opened", "thought_dissector_abandoned", "thought_dissector_premium_clicked"]);
export async function clientEvent(deps: ThoughtDeps, userId: string, event: unknown): Promise<void> {
  if (typeof event === "string" && CLIENT_EVENTS.has(event as ThoughtEvent)) await deps.track(userId, event as ThoughtEvent);
}

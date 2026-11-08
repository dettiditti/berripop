import { isViewpointId, MAP_BRANCHES, VIEWPOINT_IDS, type MapBranchId, type ThoughtMap, type ThoughtMessage, type ThoughtSummary, type ViewpointId } from "./types";

/*
 * Prompts and response parsing for the Gondolatboncoló. Pure functions: no
 * server imports, no network, so tests cover them directly. Responses are
 * JSON; anything malformed or oversized is rejected (null), which makes the
 * AI call fail cleanly and gives the allowance back (lib/ai/run.ts).
 */

const LANG: Record<string, string> = { hu: "Hungarian (informal, tegező)", en: "English" };

const VIEWPOINT_GUIDE: Record<ViewpointId, string> = {
  own: "own: how the person themselves sees and feels it",
  other: "other: how the other person or people involved might see it",
  facts: "facts: separating what is known for sure from assumptions",
  beneath: "beneath: underlying thoughts, fears, needs or earlier experiences",
  alternatives: "alternatives: other possible explanations or ways to see it",
  next: "next: what the person could do with it, if anything (options, never instructions)",
};

const RULES = [
  "You are Berri, a warm, calm companion in a self-reflection app. You help the person look at one problem from several viewpoints.",
  "Ask exactly ONE question at a time. Keep the reflection short: one or two sentences that show you heard their actual words.",
  "Adapt to what they said. Never repeat a question they already answered.",
  "Never diagnose, never label the person or others, never claim to know what others think.",
  "Do not give advice unless the viewpoint is 'next', and even then offer possibilities, not instructions.",
  "No forced positivity, no clichés, no moralising. Validate feelings without agreeing with every assumption.",
  "Phrase interpretations as possibilities ('lehet, hogy', 'talán', 'it might be').",
  "If the text suggests self-harm, suicide, abuse or immediate danger, set \"safety\": true and keep the reply short and caring.",
  "Answer with JSON only, no markdown.",
].join("\n");

export function startInstructions(locale: string, count: number) {
  return `${RULES}
Language: ${LANG[locale] ?? LANG.hu}.
Viewpoints you can use:
${VIEWPOINT_IDS.map(v => `- ${VIEWPOINT_GUIDE[v]}`).join("\n")}
Pick the ${count === 6 ? "6" : `${Math.max(3, count - 1)} or ${count}`} viewpoints most useful for this problem, listed in the order above. Always include "own"${count >= 4 ? ' and "next"' : ""}.
Return: {"viewpoints": [ids], "reply": "a short, empathetic acknowledgement", "question": "your first question, for the first viewpoint in your list", "safety": false}`;
}

export function turnInstructions(locale: string, final: boolean) {
  return `${RULES}
Language: ${LANG[locale] ?? LANG.hu}.
${final
    ? 'This is the last answer. Reflect it briefly and thank them; do not ask another question. Return: {"reply": "...", "question": "", "viewpointDone": true, "safety": false}'
    : 'Reflect their answer, then ask ONE question. Set "viewpointDone" to true when the current viewpoint has been explored enough and the question you ask belongs to the NEXT viewpoint named in the prompt; otherwise ask a follow-up within the current one. Return: {"reply": "...", "question": "...", "viewpointDone": false, "safety": false}'}`;
}

export function summaryInstructions(locale: string) {
  return `You summarise a guided self-reflection conversation for the person who had it.
Language: ${LANG[locale] ?? LANG.hu}. Address them directly ("you"). Use only what was actually said; do not invent facts.
No diagnosis, no labels, no instructions; interpretations and next steps are possibilities. Each item is one short sentence or phrase (max 140 characters). 1–4 items per list; a list may be empty if nothing fits.
Return JSON only:
{"center": "the problem in at most 8 words", "known": [], "feel": [], "assume": [], "alternatives": [], "consider": [], "nextSteps": [], "open": [], "safety": false}
known = facts that are certain; feel = feelings they named or clearly showed; assume = assumptions they make; alternatives = other possible explanations; consider = insights worth thinking about; nextSteps = possible small steps; open = questions that remain open.`;
}

export function patternsInstructions(locale: string) {
  return `You look at short summaries of several earlier self-reflection sessions of the same person and point out what may recur across them.
Language: ${LANG[locale] ?? LANG.hu}. Address them directly. 1–3 observations, each one or two sentences, phrased strictly as possibilities ("Lehet, hogy…", "Úgy tűnik, mintha…"). No diagnosis, no labels, no advice.
Return JSON only: {"observations": []}`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function startPrompt(problem: string) {
  return `The person's problem:\n${clip(problem, 4000)}`;
}

/** Only what the next turn needs: the problem, the plan of viewpoints and the recent exchange. */
export function turnPrompt(input: { problem: string; viewpoints: ViewpointId[]; done: ViewpointId[]; current: ViewpointId; next: ViewpointId | null; messages: ThoughtMessage[]; advance?: boolean }) {
  const recent = input.messages.slice(-6).map(m => `${m.role === "user" ? "Person" : "Berri"}${m.viewpoint ? ` [${m.viewpoint}]` : ""}: ${m.skipped ? "(chose to skip this viewpoint)" : clip(m.text, 1500)}`);
  return [
    `Problem:\n${clip(input.problem, 2000)}`,
    `Viewpoints: ${input.viewpoints.join(", ")}. Done: ${input.done.join(", ") || "none"}. Current: ${input.current}. Next: ${input.next ?? "none (this is the last)"}.`,
    `Recent conversation:\n${recent.join("\n")}`,
    input.advance && input.next ? `The current viewpoint is now finished. Reflect briefly, then ask the first question for the next viewpoint (${input.next}). Set "viewpointDone": true.` : "",
  ].filter(Boolean).join("\n\n");
}

export function summaryPrompt(problem: string, messages: ThoughtMessage[]) {
  const lines = messages.map(m => `${m.role === "user" ? "Person" : "Berri"}: ${m.skipped ? "(skipped)" : clip(m.text, 1200)}`);
  return `Problem:\n${clip(problem, 2000)}\n\nConversation:\n${clip(lines.join("\n"), 12000)}`;
}

export function patternsPrompt(summaries: ThoughtSummary[]) {
  return summaries.map((s, i) => `Session ${i + 1}\nAssumptions: ${s.assume.join("; ")}\nFeelings: ${s.feel.join("; ")}\nInsights: ${s.consider.join("; ")}`).join("\n\n");
}

/* ---------- parsing ---------- */

function json(text: string): Record<string, unknown> | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(t) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const list = (v: unknown, maxItems = 4, maxLen = 200): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => clip(x.trim(), maxLen)).slice(0, maxItems) : [];

/** Picks the session's viewpoints: valid, unique, canonical order, within the plan's count, at least three. */
export function chooseViewpoints(raw: unknown, count: number): ViewpointId[] {
  const n = Math.min(6, Math.max(3, count));
  if (n === 6) return [...VIEWPOINT_IDS];
  const picked = new Set<ViewpointId>(["own"]);
  if (Array.isArray(raw)) for (const v of raw) if (isViewpointId(v)) picked.add(v);
  if (n >= 4) picked.add("next");
  // Too many: keep "own" and "next", drop from the middle. Too few: fill with facts, alternatives, other.
  let out = VIEWPOINT_IDS.filter(v => picked.has(v));
  while (out.length > n) {
    const drop = [...out].reverse().find(v => v !== "own" && v !== "next");
    out = out.filter(v => v !== drop);
  }
  for (const f of ["facts", "alternatives", "other", "beneath"] as const) if (out.length < n && !out.includes(f)) out = VIEWPOINT_IDS.filter(v => out.includes(v) || v === f);
  return out;
}

export function parseStart(text: string, count: number) {
  const o = json(text);
  if (!o) return null;
  const reply = str(o.reply, 600);
  const question = str(o.question, 400);
  if (!reply || !question) return null;
  return { viewpoints: chooseViewpoints(o.viewpoints, count), reply, question, safety: o.safety === true };
}

export function parseTurn(text: string, final: boolean) {
  const o = json(text);
  if (!o) return null;
  const reply = str(o.reply, 600);
  const question = final ? "" : str(o.question, 400);
  if (!reply || question === null) return null;
  return { reply, question, viewpointDone: final || o.viewpointDone === true, safety: o.safety === true };
}

export function parseSummary(text: string) {
  const o = json(text);
  if (!o) return null;
  const summary: ThoughtSummary = {
    v: 1,
    known: list(o.known), feel: list(o.feel, 6, 60), assume: list(o.assume), alternatives: list(o.alternatives),
    consider: list(o.consider), nextSteps: list(o.nextSteps, 3), open: list(o.open, 3),
  };
  const filled = [summary.known, summary.feel, summary.assume, summary.alternatives, summary.consider, summary.nextSteps, summary.open].filter(l => l.length).length;
  if (filled < 3) return null;
  const center = str(o.center, 120) ?? "";
  return { summary, center, safety: o.safety === true };
}

export function parsePatterns(text: string) {
  const o = json(text);
  if (!o) return null;
  const observations = list(o.observations, 3, 400);
  return observations.length ? observations : null;
}

/** The mind map is built from the summary: Free gets the basic four branches, deep plans all six with more items. */
export function buildMap(summary: ThoughtSummary, center: string, deep: boolean): ThoughtMap {
  const from: Record<MapBranchId, string[]> = {
    feelings: summary.feel, facts: summary.known, assumptions: summary.assume,
    alternatives: summary.alternatives, insights: summary.consider, steps: summary.nextSteps,
  };
  const ids = deep ? MAP_BRANCHES : MAP_BRANCHES.slice(0, 4);
  return { v: 1, center, branches: ids.map(id => ({ id, items: from[id].slice(0, deep ? 4 : 2) })) };
}

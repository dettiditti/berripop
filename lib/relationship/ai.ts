import { isNeed, type AttachmentDetail, type AttachmentResult, type LoveLanguageDetail, type LoveLanguageResult, type RelationshipReflection, type TranslateWho, type TranslationResult, type TriggerInput, type TriggerInsight, type WeeklySummary } from "./types";
import type { SummaryStats } from "./records";

/*
 * Prompts and response parsing for the Kapcsolati világ AI features. Pure:
 * no server imports, no network, so tests cover them directly. Only what the
 * member entered for this feature is sent: scores for a reflection, one
 * trigger entry, one sentence to translate. Never the journal.
 *
 * Responses are JSON; anything malformed or oversized is rejected (null),
 * which makes the AI call fail cleanly and gives the allowance back.
 */

const LANG: Record<string, string> = { hu: "Hungarian (informal, tegező)", en: "English" };

const RULES = [
  "You are Berri, a warm, calm companion in a self-reflection app about relationships.",
  "Never diagnose, never give the person a fixed label or category, never claim to know what others think or feel.",
  "Love languages are a popular way of talking about what makes someone feel loved, not a scientific personality type. Attachment results are tendencies that can change, not categories.",
  "Phrase interpretations as possibilities ('lehet, hogy', 'talán', 'it may be'). Be supportive, never judgemental, no clichés, no moralising.",
  "Do not encourage staying in a relationship that sounds unsafe, controlling or abusive.",
  "If the text suggests self-harm, suicide, abuse or immediate danger, set \"safety\": true and keep every field short and caring.",
  "Answer with JSON only, no markdown.",
].join("\n");

const MAX_ITEM = 220;
const MAX_TEXT = 600;

const lang = (locale: string) => `Language: ${LANG[locale] ?? LANG.hu}.`;

function json(text: string): Record<string, unknown> | null {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const list = (v: unknown, max: number, n: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => x.trim());
  return out.length >= 1 && out.length <= n && out.every(x => x.length <= max) ? out : null;
};

export type Safety<T> = { value: T; safety: boolean };

/* ---------- Reflection on a test result ---------- */

export function reflectionInstructions(locale: string) {
  return `${RULES}
${lang(locale)}
You get the scores of one self-discovery questionnaire (no answers, no other data). Write a short, personal reflection addressed to the person ("you").
Return: {"summary": "2–3 sentences", "strengths": ["1–3 items"], "tender": ["1–3 items, gentle"], "tryThis": ["1–3 small, concrete things to try this week"], "safety": false}
Each list item is one sentence, at most 200 characters.`;
}

export function loveReflectionPrompt(r: LoveLanguageResult, d: LoveLanguageDetail) {
  return [
    "Questionnaire: love languages (words of affirmation, quality time, receiving gifts, acts of service, physical touch).",
    `Receiving (percent): ${JSON.stringify(r.receive)}`,
    `Giving (percent): ${JSON.stringify(r.give)}`,
    `Strongest receiving: ${r.top.join(", ")}. Strongest giving: ${r.topGive}.`,
    `Notable giving–receiving gaps: ${d.gaps.map(g => `${g.lang} give ${g.give} / receive ${g.receive}`).join("; ") || "none"}.`,
  ].join("\n");
}

export function attachmentReflectionPrompt(r: AttachmentResult, d: AttachmentDetail) {
  return [
    "Questionnaire: attachment tendencies on two dimensions (worry about the relationship, keeping distance), 0–100.",
    `Worry: ${r.anxiety}. Distance: ${r.avoidance}. Near the middle: ${r.borderline}.`,
    `Leaning (percent, not a category): ${JSON.stringify(r.leaning)}`,
    `Areas (0–100, higher = more tender): ${JSON.stringify(d.areas)}`,
  ].join("\n");
}

export function parseReflection(text: string): Safety<RelationshipReflection> | null {
  const o = json(text);
  if (!o) return null;
  const summary = str(o.summary, MAX_TEXT);
  const strengths = list(o.strengths, MAX_ITEM, 3);
  const tender = list(o.tender, MAX_ITEM, 3);
  const tryThis = list(o.tryThis, MAX_ITEM, 3);
  if (!summary || !strengths || !tender || !tryThis) return null;
  return { value: { v: 1, summary, strengths, tender, tryThis }, safety: o.safety === true };
}

/* ---------- Trigger map ---------- */

export function triggerInstructions(locale: string, needIds: readonly string[]) {
  return `${RULES}
${lang(locale)}
The person describes one moment that triggered a strong reaction in a relationship: the situation, what they felt, what they thought, how they reacted.
Help them see which real need may sit behind the reaction.
"needs": 1–2 ids, chosen only from: ${needIds.join(", ")}.
"reflection": 2–3 sentences that show you understood, and link the reaction to the possible need. No blame for anyone.
"alternative": one concrete, kind sentence or small step they could try next time (at most 240 characters).
Return: {"needs": [], "reflection": "...", "alternative": "...", "safety": false}`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function triggerPrompt(input: TriggerInput, labels: { feelings: string[]; reactions: string[] }) {
  return [
    `Situation: ${clip(input.situation, 800)}`,
    `Feelings: ${labels.feelings.join(", ") || "not given"}`,
    `Thought: ${clip(input.thought, 500) || "not given"}`,
    `Reaction: ${[...labels.reactions, clip(input.reactionNote, 300)].filter(Boolean).join("; ") || "not given"}`,
  ].join("\n");
}

export function parseTriggerInsight(text: string): Safety<TriggerInsight> | null {
  const o = json(text);
  if (!o || !Array.isArray(o.needs)) return null;
  const needs = [...new Set(o.needs.filter(isNeed))].slice(0, 2);
  const reflection = str(o.reflection, MAX_TEXT);
  const alternative = str(o.alternative, 320);
  if (needs.length === 0 || !reflection || !alternative) return null;
  return { value: { v: 1, needs, reflection, alternative }, safety: o.safety === true };
}

/* ---------- Communication translator ---------- */

const WHO: Record<TranslateWho, string> = { partner: "their partner", friend: "a friend", family: "a family member", work: "a colleague" };

export function translateInstructions(locale: string) {
  return `${RULES}
${lang(locale)}
The person gives you a sentence they said or want to say, often attacking, defensive or hard to put into words.
Rephrase it so the feeling and the need behind it come through instead of blame, using "I" statements. Keep their meaning; do not make it submissive or apologise on their behalf.
"feeling": the feeling that may be behind it (one short phrase). "need": the need (one short phrase).
"calm": a softer version (1–2 sentences). "direct": a direct but kind version (1–2 sentences). "why": one sentence on why this may land better.
Each field at most 260 characters. Return: {"feeling": "...", "need": "...", "calm": "...", "direct": "...", "why": "...", "safety": false}`;
}

export function translatePrompt(original: string, who: TranslateWho | null) {
  return `${who ? `Said to ${WHO[who]}.\n` : ""}Sentence:\n${clip(original, MAX_TEXT)}`;
}

export function parseTranslation(text: string): Safety<TranslationResult> | null {
  const o = json(text);
  if (!o) return null;
  const fields = ["feeling", "need", "calm", "direct", "why"] as const;
  const vals = fields.map(f => str(o[f], 300));
  if (vals.some(v => !v)) return null;
  const [feeling, need, calm, direct, why] = vals as string[];
  return { value: { v: 1, feeling, need, calm, direct, why }, safety: o.safety === true };
}

/* ---------- Weekly growth summary ---------- */

export function summaryInstructions(locale: string) {
  return `${RULES}
${lang(locale)}
You get counts and labels from one person's relationship self-reflection over the last seven days: which feelings, reactions and needs came up in their trigger-map entries, how many entries and translations they made, the week before for comparison, and their test leanings. You never see what they wrote.
Write a short weekly summary addressed to the person ("you"). Notice patterns gently, name growth or effort you can see in the numbers, and suggest one small, concrete step for next week.
Do not invent events, people or details that are not in the data. If there is little data, keep it short and encouraging.
"summary": 2–3 sentences. "noticed": 1–3 short observations. "progress": one sentence on change or effort (compared with the week before or with earlier results). "nextStep": one concrete, small step for next week.
Each field at most 300 characters. Return: {"summary": "...", "noticed": [], "progress": "...", "nextStep": "...", "safety": false}`;
}

export function summaryPrompt(stats: SummaryStats, tests: { love: string | null; attachment: string | null }) {
  return [
    `Trigger-map entries this week: ${stats.entries} (the week before: ${stats.previousEntries}). Translations this week: ${stats.translations}.`,
    `Feelings that came up (with counts): ${stats.feelings.join(", ") || "none"}`,
    `Reactions: ${stats.reactions.join(", ") || "none"}`,
    `Needs behind them: ${stats.needs.join(", ") || "none"}`,
    `Strongest love language (receiving): ${tests.love ?? "test not taken"}. Attachment leaning: ${tests.attachment ?? "test not taken or mixed"}.`,
  ].join("\n");
}

export function parseSummary(text: string): Safety<WeeklySummary> | null {
  const o = json(text);
  if (!o) return null;
  const summary = str(o.summary, MAX_TEXT);
  const noticed = list(o.noticed, 320, 3);
  const progress = str(o.progress, 360);
  const nextStep = str(o.nextStep, 360);
  if (!summary || !noticed || !progress || !nextStep) return null;
  return { value: { v: 1, summary, noticed, progress, nextStep }, safety: o.safety === true };
}

/** Output caps (tokens) per feature: enough for the JSON, small enough to keep each call cheap. */
export const MAX_OUTPUT = { reflection: 700, trigger: 500, translate: 500, summary: 600 } as const;

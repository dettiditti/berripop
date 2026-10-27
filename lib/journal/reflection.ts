/**
 * Shapes and parsing for AI journal reflections. The model is asked for JSON;
 * anything malformed is rejected rather than shown, and every field is length
 * capped so a misbehaving response can't flood the UI or the database.
 */

export type InsightKind = "theme" | "question" | "exercise" | "quest";
export const INSIGHT_KINDS: InsightKind[] = ["theme", "question", "exercise", "quest"];

/**
 * How the person wants to be helped with this entry, chosen per request:
 * listen (be heard), reflect (think it through together), practical (one small idea).
 */
export type SupportMode = "listen" | "reflect" | "practical";
export const SUPPORT_MODES: SupportMode[] = ["listen", "reflect", "practical"];
export const isSupportMode = (v: unknown): v is SupportMode => SUPPORT_MODES.includes(v as SupportMode);

export type ReflectionSuggestion = { kind: InsightKind; text: string; goalId: string | null };

export type ParsedReflection = {
  noticed: string;
  strength: string | null;
  explore: string;
  nextStep: string | null;
  /** Other possible readings of the situation, always phrased as possibilities (0–3). */
  alternatives: string[];
  suggestion: ReflectionSuggestion | null;
};

export type ParsedWeekly = {
  /** Things the person explicitly wrote (close paraphrases), kept apart from hypotheses. */
  youSaid: string[];
  /** Tentative AI observations, always phrased as possibilities. */
  maybe: string[];
  questions: string[];
  /** Proposed insights the person can save, edit or dismiss. */
  proposals: { kind: InsightKind; text: string }[];
};

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+\n/g, "\n");
  return s ? s.slice(0, max) : null;
};

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseReflection(raw: string, goalIds: string[]): ParsedReflection | null {
  const obj = extractJson(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return null;
  const noticed = clip(obj.noticed, 600);
  const explore = clip(obj.explore, 300);
  if (!noticed || !explore) return null;
  let suggestion: ReflectionSuggestion | null = null;
  const s = obj.suggestion as Record<string, unknown> | null | undefined;
  if (s && typeof s === "object") {
    const kind = INSIGHT_KINDS.includes(s.kind as InsightKind) ? (s.kind as InsightKind) : null;
    const text = clip(s.text, 300);
    const goalId = typeof s.goalId === "string" && goalIds.includes(s.goalId) ? s.goalId : null;
    if (kind && text) suggestion = { kind, text, goalId };
  }
  const alternatives = (Array.isArray(obj.alternatives) ? obj.alternatives : []).map(x => clip(x, 250)).filter((x): x is string => !!x).slice(0, 3);
  return { noticed, strength: clip(obj.strength, 400), explore, nextStep: clip(obj.nextStep, 300), alternatives, suggestion };
}

export function parseWeekly(raw: string): ParsedWeekly | null {
  const obj = extractJson(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return null;
  const list = (v: unknown, n: number, max: number) =>
    (Array.isArray(v) ? v : []).map(x => clip(x, max)).filter((x): x is string => !!x).slice(0, n);
  const proposals = (Array.isArray(obj.proposals) ? obj.proposals : [])
    .map(p => {
      const r = p as Record<string, unknown>;
      const kind = INSIGHT_KINDS.includes(r?.kind as InsightKind) ? (r.kind as InsightKind) : null;
      const text = clip(r?.text, 300);
      return kind && text ? { kind, text } : null;
    })
    .filter((p): p is { kind: InsightKind; text: string } => !!p)
    .slice(0, 3);
  const out = { youSaid: list(obj.youSaid, 5, 300), maybe: list(obj.maybe, 3, 300), questions: list(obj.questions, 3, 250), proposals };
  return out.youSaid.length || out.maybe.length || out.questions.length ? out : null;
}

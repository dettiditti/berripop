import {
  ATTACHMENT_AREAS, ATTACHMENT_PATTERNS, FEELINGS, LOVE_LANGUAGES, NEEDS, REACTIONS,
  type AttachmentArea, type AttachmentDetail, type AttachmentPattern, type AttachmentResult, type Feeling, type Likert,
  type LoveLanguage, type LoveLanguageDetail, type LoveLanguageResult, type LoveLanguageScores, type Need, type PairChoice,
  type GrowthQuestion, type GrowthWeek, type Reaction, type TriggerPatterns,
} from "./types";

/*
 * Scoring for the Kapcsolati világ tests. Deterministic and pure: no AI is
 * needed to score a questionnaire, so results are instant, free and the same
 * every time. Question texts live in lib/relationship/copy.ts; here only their
 * structure (which language or axis each answer counts for).
 */

/* ---------- Love languages ---------- */

/**
 * Every pair of the five languages exactly once (10 pairs), so each language
 * is offered four times and none is favoured by the question set. Asked once
 * for receiving and once for giving, in different orders.
 */
export const RECEIVE_PAIRS: readonly [LoveLanguage, LoveLanguage][] = [
  ["words", "time"], ["gifts", "touch"], ["acts", "words"], ["time", "gifts"], ["touch", "acts"],
  ["words", "gifts"], ["time", "touch"], ["acts", "gifts"], ["touch", "words"], ["time", "acts"],
];
export const GIVE_PAIRS: readonly [LoveLanguage, LoveLanguage][] = [
  ["time", "acts"], ["words", "touch"], ["gifts", "time"], ["acts", "touch"], ["words", "gifts"],
  ["touch", "time"], ["acts", "words"], ["gifts", "touch"], ["time", "words"], ["gifts", "acts"],
];

export const isPairChoice = (v: unknown): v is PairChoice => v === "a" || v === "both" || v === "b";
export const isLikert = (v: unknown): v is Likert => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

/** Two receiving languages this close (in percent points) are both shown as the strongest. */
export const TOP_TIE = 5;
/** A giving–receiving difference worth pointing out (percent points). */
export const GAP_NOTABLE = 10;

/** Rounds shares to whole percents that still add up to exactly 100 (largest remainder). */
export function toPercents<K extends string>(points: Record<K, number>, keys: readonly K[]): Record<K, number> {
  const total = keys.reduce((n, k) => n + points[k], 0);
  const out = Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
  if (total <= 0) {
    // No signal at all: an even split, still adding up to 100.
    keys.forEach((k, i) => { out[k] = Math.floor(100 / keys.length) + (i < 100 % keys.length ? 1 : 0); });
    return out;
  }
  const raw = keys.map(k => ({ k, v: (points[k] / total) * 100 }));
  raw.forEach(r => { out[r.k] = Math.floor(r.v); });
  let left = 100 - raw.reduce((n, r) => n + Math.floor(r.v), 0);
  for (const r of [...raw].sort((x, y) => (y.v - Math.floor(y.v)) - (x.v - Math.floor(x.v)) || keys.indexOf(x.k) - keys.indexOf(y.k))) {
    if (left <= 0) break;
    out[r.k] += 1;
    left -= 1;
  }
  return out;
}

function pairPoints(pairs: readonly [LoveLanguage, LoveLanguage][], answers: readonly PairChoice[]): LoveLanguageScores {
  const pts = Object.fromEntries(LOVE_LANGUAGES.map(l => [l, 0])) as LoveLanguageScores;
  pairs.forEach(([a, b], i) => {
    const c = answers[i];
    if (c === "a") pts[a] += 2;
    else if (c === "b") pts[b] += 2;
    else if (c === "both") { pts[a] += 1; pts[b] += 1; }
  });
  return pts;
}

const byScore = (s: LoveLanguageScores) => [...LOVE_LANGUAGES].sort((x, y) => s[y] - s[x] || LOVE_LANGUAGES.indexOf(x) - LOVE_LANGUAGES.indexOf(y));

export function validLoveAnswers(receive: unknown, give: unknown): receive is PairChoice[] {
  return Array.isArray(receive) && Array.isArray(give)
    && receive.length === RECEIVE_PAIRS.length && give.length === GIVE_PAIRS.length
    && receive.every(isPairChoice) && give.every(isPairChoice);
}

export function scoreLoveLanguages(receiveAnswers: readonly PairChoice[], giveAnswers: readonly PairChoice[]): LoveLanguageResult {
  const receive = toPercents(pairPoints(RECEIVE_PAIRS, receiveAnswers), LOVE_LANGUAGES);
  const give = toPercents(pairPoints(GIVE_PAIRS, giveAnswers), LOVE_LANGUAGES);
  const order = byScore(receive);
  const top = receive[order[0]] - receive[order[1]] <= TOP_TIE ? order.slice(0, 2) : order.slice(0, 1);
  return { receive, give, top, topGive: byScore(give)[0] };
}

export function loveLanguageDetail(r: LoveLanguageResult): LoveLanguageDetail {
  const gaps = LOVE_LANGUAGES
    .map(lang => ({ lang, give: r.give[lang], receive: r.receive[lang] }))
    .filter(g => Math.abs(g.give - g.receive) >= GAP_NOTABLE)
    .sort((x, y) => Math.abs(y.give - y.receive) - Math.abs(x.give - x.receive));
  const order = byScore(r.receive);
  // Giving most in a language that is among the two the member needs least.
  const mismatch = order.slice(-2).includes(r.topGive);
  return { gaps, mismatch, order };
}

/* ---------- Attachment ---------- */

export type AttachmentItem = { area: AttachmentArea; axis: "anxiety" | "avoidance"; reverse?: boolean };

/** 18 statements, three per area, nine per axis. Texts: copy.ts (same order). */
export const ATTACHMENT_ITEMS: readonly AttachmentItem[] = [
  { area: "closeness", axis: "avoidance" },
  { area: "distance", axis: "anxiety" },
  { area: "rejection", axis: "anxiety" },
  { area: "conflict", axis: "avoidance" },
  { area: "reassurance", axis: "anxiety" },
  { area: "autonomy", axis: "avoidance" },
  { area: "closeness", axis: "avoidance", reverse: true },
  { area: "distance", axis: "avoidance" },
  { area: "rejection", axis: "anxiety" },
  { area: "conflict", axis: "anxiety" },
  { area: "reassurance", axis: "anxiety", reverse: true },
  { area: "autonomy", axis: "avoidance", reverse: true },
  { area: "closeness", axis: "anxiety" },
  { area: "distance", axis: "anxiety", reverse: true },
  { area: "rejection", axis: "avoidance" },
  { area: "conflict", axis: "avoidance", reverse: true },
  { area: "reassurance", axis: "avoidance" },
  { area: "autonomy", axis: "anxiety" },
];

/** A main leaning is named only when it reaches this share; below it the result is "mixed". */
export const MAIN_LEANING = 40;
/** Within this distance of the middle (0–100) a score may tip either way. */
export const BORDER = 10;

/** 0 (no sign) … 1 (strong sign) for one answer, in the direction of its axis. */
const itemValue = (item: AttachmentItem, a: Likert) => (item.reverse ? 5 - a : a - 1) / 4;

export function validAttachmentAnswers(answers: unknown): answers is Likert[] {
  return Array.isArray(answers) && answers.length === ATTACHMENT_ITEMS.length && answers.every(isLikert);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);

export function scoreAttachment(answers: readonly Likert[]): AttachmentResult {
  const axis = (k: AttachmentItem["axis"]) => mean(ATTACHMENT_ITEMS.flatMap((it, i) => (it.axis === k ? [itemValue(it, answers[i])] : [])));
  const a = axis("anxiety");
  const v = axis("avoidance");
  // Two dimensions, four corners: each pattern's share is how close the answers sit to its corner.
  const weights: Record<AttachmentPattern, number> = {
    secure: (1 - a) * (1 - v),
    anxious: a * (1 - v),
    avoidant: (1 - a) * v,
    fearful: a * v,
  };
  const leaning = toPercents(Object.fromEntries(ATTACHMENT_PATTERNS.map(p => [p, Math.round(weights[p] * 1000)])) as Record<AttachmentPattern, number>, ATTACHMENT_PATTERNS);
  const best = [...ATTACHMENT_PATTERNS].sort((x, y) => leaning[y] - leaning[x])[0];
  const anxiety = Math.round(a * 100);
  const avoidance = Math.round(v * 100);
  return {
    anxiety,
    avoidance,
    leaning,
    main: leaning[best] >= MAIN_LEANING ? best : null,
    borderline: Math.abs(anxiety - 50) <= BORDER || Math.abs(avoidance - 50) <= BORDER,
  };
}

export function attachmentDetail(answers: readonly Likert[]): AttachmentDetail {
  const areas = Object.fromEntries(ATTACHMENT_AREAS.map(area => [
    area,
    Math.round(mean(ATTACHMENT_ITEMS.flatMap((it, i) => (it.area === area ? [itemValue(it, answers[i])] : []))) * 100),
  ])) as Record<AttachmentArea, number>;
  const sorted = [...ATTACHMENT_AREAS].sort((x, y) => areas[y] - areas[x] || ATTACHMENT_AREAS.indexOf(x) - ATTACHMENT_AREAS.indexOf(y));
  return { areas, tender: sorted.slice(0, 2), steady: sorted.slice(-2).reverse() };
}

/* ---------- Trigger map ---------- */

function counts<K extends string>(ids: readonly K[], lists: K[][]): { id: K; count: number }[] {
  const c = new Map<K, number>();
  for (const list of lists) for (const id of new Set(list)) c.set(id, (c.get(id) ?? 0) + 1);
  return ids.filter(id => (c.get(id) ?? 0) > 0).map(id => ({ id, count: c.get(id)! })).sort((x, y) => y.count - x.count || ids.indexOf(x.id) - ids.indexOf(y.id));
}

/** What keeps coming back across the member's trigger entries: counted, never guessed. Only things seen at least twice. */
export function triggerPatterns(entries: { feelings: Feeling[]; reactions: Reaction[]; needs: Need[] }[]): TriggerPatterns {
  const twice = <T extends { count: number }>(xs: T[]) => xs.filter(x => x.count >= 2).slice(0, 3);
  return {
    entries: entries.length,
    feelings: twice(counts(FEELINGS, entries.map(e => e.feelings))),
    reactions: twice(counts(REACTIONS, entries.map(e => e.reactions))),
    needs: twice(counts(NEEDS, entries.map(e => e.needs))),
  };
}

/* ---------- Daily question ---------- */

/** Days since 1970-01-01 for a YYYY-MM-DD date (UTC, so time zones never shift it). */
const dayNumber = (date: string) => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000);

/** The same question all day for everyone, a different one each day, going round the whole list. */
export function dailyQuestionIndex(date: string, count: number): number {
  if (count <= 0) return 0;
  return ((dayNumber(date) % count) + count) % count;
}

/* ---------- Growth path ---------- */

const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD, UTC) of the week a moment falls in. */
export function weekStart(at: Date): string {
  const t = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return ymd(t - dow * DAY);
}

/** ISO 8601 week id, e.g. "2026-W46" (UTC). */
export function isoWeek(at: Date): string {
  const t = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  const thursday = new Date(t + (3 - dow) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** A test can be taken again this many days after the last one, so a comparison means something. */
export const RETEST_DAYS = 30;

/** The date (YYYY-MM-DD) from when a test can be taken again, or null when it can be taken now. */
export function retestFrom(last: Date | null, now: Date): string | null {
  if (!last) return null;
  const from = last.getTime() + RETEST_DAYS * DAY;
  return from > now.getTime() ? ymd(from) : null;
}

const top1 = <K extends string>(ids: readonly K[], lists: K[][]): K | null => counts(ids, lists)[0]?.id ?? null;

/** The last `n` weeks of the member's own activity, oldest first: counted per Monday-to-Sunday week. */
export function growthWeeks(
  now: Date,
  triggers: { at: Date; feelings: Feeling[]; needs: Need[] }[],
  translations: { at: Date }[],
  n = 4,
): GrowthWeek[] {
  const thisMonday = Date.parse(`${weekStart(now)}T00:00:00Z`);
  return Array.from({ length: n }, (_, k) => {
    const from = thisMonday - (n - 1 - k) * 7 * DAY;
    const to = from + 7 * DAY;
    const inWeek = <T extends { at: Date }>(xs: T[]) => xs.filter(x => x.at.getTime() >= from && x.at.getTime() < to);
    const ts = inWeek(triggers);
    return {
      week: isoWeek(new Date(from)),
      start: ymd(from),
      triggers: ts.length,
      translations: inWeek(translations).length,
      topFeeling: top1(FEELINGS, ts.map(t => t.feelings)),
      topNeed: top1(NEEDS, ts.map(t => t.needs)),
    };
  });
}

/** How many reflection questions each tag has in the copy (tests check the copy matches). */
export const GROWTH_QUESTION_COUNTS = { words: 3, time: 3, gifts: 3, acts: 3, touch: 3, secure: 3, anxious: 3, avoidant: 3, fearful: 3, general: 6 } as const;

/**
 * This week's reflection question, from the member's own results: on even
 * weeks about their strongest love language, on odd weeks about their
 * attachment leaning, otherwise (or without results) a general one.
 */
export function weeklyQuestion(week: string, love: LoveLanguage | null, attachment: AttachmentPattern | null): GrowthQuestion {
  const n = Number(week.slice(0, 4)) * 53 + Number(week.slice(6));
  const tag = n % 2 === 0 ? (love ?? attachment ?? "general") : (attachment ?? love ?? "general");
  const round = Math.floor(n / 2);
  return { tag, index: round % GROWTH_QUESTION_COUNTS[tag] };
}

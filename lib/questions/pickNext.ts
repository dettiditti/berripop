import { addDays, hash } from "../dates";
import { baseRef, bankQuestion, bankQuestions, journeyPlan, type BankQuestion } from "./bank";

/**
 * Picks the daily question from the bank (question concept 6.1 and 6.2).
 * Pure and deterministic: the same seed, date and history give the same question.
 *
 * Waiting times: a question family waits 45 days, a subtheme 7 days, and a theme
 * comes at most twice in 7 days. A question that was asked but not answered also
 * waits 45 days. Level 2 needs a level-1 answer in the same theme first; level 3
 * never comes on its own. When fewer than three light or resource questions came
 * in the last six days, today's is one of those. When everything is waiting, the
 * question asked longest ago comes back as a repeat (`A1.3:r2`), so its old
 * answer stays.
 */

/** A question the member (or circle) was given or answered on a day. */
export type SeenQuestion = { ref: string; date: string };

export type PickInput = {
  /** Stable seed: the member's id (personal) or the circle's id. */
  seed: string;
  date: string;
  /** Everything asked, answered or set aside before (any order, repeats fine). */
  seen: SeenQuestion[];
  /** Questions answered (bank ids or repeats). Drive the level-2 rule and what is left. */
  answered: Iterable<string>;
};

export type PersonalPickInput = PickInput & {
  /** Journey days the member has done: the questions of the days still ahead are left for the journey. */
  journeyDone: Record<number, unknown>;
  /** Only a light or resource question (after "Inkább mást kérek"). */
  lightOnly?: boolean;
  /** Never these today (e.g. the question just set aside). */
  exclude?: string[];
};

export type CirclePickInput = PickInput & {
  /** The circle's own questions (custom refs). */
  customRefs: string[];
  /** Questions any member of the circle already answered there. */
  answeredInCircle: Iterable<string>;
};

const FAMILY_DAYS = 45;
const SUBTHEME_DAYS = 7;
const THEME_DAYS = 7;
const THEME_MAX = 2;
const LIGHT_DAYS = 6;
const LIGHT_MIN = 3;

/** Bank questions that may come as the member's own daily question. */
export const personalDailyPool: BankQuestion[] = bankQuestions.filter(b =>
  (b.depth === 1 || b.depth === 2) && !b.followUpOnly && !b.only
  && !["G1", "G2", "G3"].includes(b.subtheme) && b.id !== "G4.3");

/** Bank questions that may come as a circle's daily question. */
export const circleDailyPool: BankQuestion[] = bankQuestions.filter(b => b.circleSafe && !b.followUpOnly && !b.only);

/** A light moment or a resource question: what the weekly rhythm asks for. */
export const isLight = (b: BankQuestion) => b.resource || (b.depth === 1 && b.sensitivity === "light");

const within = (date: string, from: string, days: number) => date > addDays(from, -days) && date <= from;

type Seen = { ref: string; base: string; bank?: BankQuestion; date: string };
const toSeen = (s: SeenQuestion[]): Seen[] => s.map(x => ({ ref: x.ref, base: baseRef(x.ref), bank: bankQuestion(x.ref), date: x.date }));

/**
 * Whether waiting rules keep `b` from coming on `date`. `relax` 1 drops the theme
 * count, 2 also the subtheme wait (the 45-day question and family waits stay).
 */
function waits(b: BankQuestion, seen: Seen[], date: string, relax: 0 | 1 | 2 = 0): boolean {
  for (const s of seen) {
    if (s.base === b.id && within(s.date, date, FAMILY_DAYS)) return true;
    if (!s.bank) continue;
    if (b.family && s.bank.family === b.family && within(s.date, date, FAMILY_DAYS)) return true;
    if (relax < 2 && s.bank.subtheme === b.subtheme && within(s.date, date, SUBTHEME_DAYS)) return true;
  }
  if (relax > 0) return false;
  const themeDays = new Set(seen.filter(s => s.bank?.theme === b.theme && within(s.date, date, THEME_DAYS)).map(s => s.date));
  return themeDays.size >= THEME_MAX;
}

/** Light or resource questions in the last six days (one per day at most counts). */
function lightDays(seen: Seen[], date: string): number {
  return new Set(seen.filter(s => s.bank && isLight(s.bank) && within(s.date, addDays(date, -1), LIGHT_DAYS)).map(s => s.date)).size;
}

const pickOne = <T>(list: T[], seed: string, date: string) => list[hash(`${seed}:${date}`) % list.length];

/** The repeat of `ref` after the ones already asked: `A1.3` → `A1.3:r2` → `A1.3:r3`. */
export function nextRepeat(ref: string, seenRefs: Iterable<string>): string {
  const base = baseRef(ref);
  let n = 1;
  for (const r of seenRefs) {
    if (baseRef(r) !== base) continue;
    const m = /:r(\d+)$/.exec(r);
    n = Math.max(n, m ? Number(m[1]) : 1);
  }
  return `${base}:r${n + 1}`;
}

/** The question asked longest ago among `refs` (never asked counts as oldest). */
function oldest(refs: string[], seen: Seen[]): string | undefined {
  const last = new Map<string, string>();
  for (const s of seen) if ((last.get(s.base) ?? "") < s.date) last.set(s.base, s.date);
  return [...refs].sort((a, b) => (last.get(a) ?? "").localeCompare(last.get(b) ?? "") || a.localeCompare(b))[0];
}

export function pickPersonalQuestion(input: PersonalPickInput): string {
  const seen = toSeen(input.seen);
  const answeredBase = new Set([...input.answered].map(baseRef));
  const answeredBank = [...answeredBase].map(r => bankQuestion(r)).filter((b): b is BankQuestion => !!b);
  const ahead = new Set(journeyPlan.filter((_, i) => !input.journeyDone[i + 1]));
  const exclude = new Set((input.exclude ?? []).map(baseRef));
  const stepOk = (b: BankQuestion) => b.depth === 1 || answeredBank.some(a => a.theme === b.theme && a.depth === 1);
  const open = personalDailyPool.filter(b => !ahead.has(b.id) && !exclude.has(b.id) && stepOk(b) && (!input.lightOnly || isLight(b)));
  const free = open.filter(b => !waits(b, seen, input.date));
  const fresh = free.filter(b => !answeredBase.has(b.id));
  const again = free.filter(b => answeredBase.has(b.id));
  const needLight = lightDays(seen, input.date) < LIGHT_MIN;

  // A new question first; the weekly rhythm wins over newness (a light repeat before a heavier new one).
  const tiers: [BankQuestion[], "pick" | "oldest"][] = [
    ...(needLight ? [[fresh.filter(isLight), "pick"], [again.filter(isLight), "oldest"]] as [BankQuestion[], "pick" | "oldest"][] : []),
    [fresh, "pick"],
    [again, "oldest"],
    // Everything is waiting: relax the theme count, then the subtheme wait, then the one asked longest ago.
    [open.filter(b => !waits(b, seen, input.date, 1)), "oldest"],
    [open.filter(b => !waits(b, seen, input.date, 2)), "oldest"],
    [open, "oldest"],
  ];
  for (const [list, how] of tiers) {
    if (!list.length) continue;
    const ref = how === "pick" ? pickOne(list, input.seed, input.date).id : oldest(list.map(b => b.id), seen)!;
    return answeredBase.has(ref) ? nextRepeat(ref, [...seen.map(s => s.ref), ...input.answered]) : ref;
  }
  return personalDailyPool[0].id;
}

export function pickCircleQuestion(input: CirclePickInput): string {
  const seen = toSeen(input.seen);
  const answeredBase = new Set([...input.answeredInCircle].map(baseRef));
  const askedBase = new Set(seen.map(s => s.base));
  const customFree = input.customRefs.filter(r => !seen.some(s => s.base === r && within(s.date, input.date, FAMILY_DAYS)));
  const bankFree = circleDailyPool.filter(b => !waits(b, seen, input.date)).map(b => b.id);
  const free = [...bankFree, ...customFree];
  // First what nobody in the circle answered yet, then what the circle was never asked.
  const untouched = free.filter(r => !answeredBase.has(r) && !askedBase.has(r));
  const unanswered = free.filter(r => !answeredBase.has(r));
  const list = untouched.length ? untouched : unanswered;
  if (list.length) return pickOne(list, input.seed, input.date);

  const all = [...circleDailyPool.map(b => b.id), ...input.customRefs];
  const ref = oldest(free.length ? free : all, seen) ?? all[0];
  return answeredBase.has(ref) ? nextRepeat(ref, [...seen.map(s => s.ref), ...input.answeredInCircle]) : ref;
}

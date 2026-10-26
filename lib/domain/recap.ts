import { addDays } from "../dates";
import type { QuestTheme } from "../types";
import { dateOf, resolveQuestion } from "./rules";
import type { View } from "./view";

/**
 * The free weekly recap: the last 7 days (today included), counted from the
 * member's own records in the snapshot. No AI and no journal text: only dates,
 * counts, themes and badge ids.
 */
export type WeeklyRecap = {
  /** Oldest first, ending today. */
  days: { date: string; active: boolean }[];
  activeDays: number;
  answers: number;
  journeyStops: number;
  moments: number;
  xp: number;
  /** The theme the member spent the most answers on (ties: the most recent). */
  topTheme: QuestTheme | null;
  badges: string[];
};

type RecapView = Pick<View, "today" | "myAnswers" | "circle"> & { snapshot: Pick<View["snapshot"], "progress"> };

export const RECAP_DAYS = 7;

export function weeklyRecap(view: RecapView): WeeklyRecap {
  const { progress } = view.snapshot;
  const from = addDays(view.today, -(RECAP_DAYS - 1));
  const inWeek = (date: string) => date >= from && date <= view.today;

  const active = new Set(progress.activeDates.filter(inWeek));
  const days = Array.from({ length: RECAP_DAYS }, (_, i) => {
    const date = addDays(from, i);
    return { date, active: active.has(date) };
  });

  const answers = view.myAnswers.filter(a => inWeek(a.date));
  const themes = new Map<QuestTheme, { n: number; last: string }>();
  for (const a of answers) {
    const theme = resolveQuestion(a.questionRef, view.circle)?.theme;
    if (!theme) continue;
    const t = themes.get(theme) ?? { n: 0, last: "" };
    themes.set(theme, { n: t.n + 1, last: a.date > t.last ? a.date : t.last });
  }
  let topTheme: QuestTheme | null = null;
  for (const [theme, t] of themes) {
    const best = topTheme ? themes.get(topTheme)! : null;
    if (!best || t.n > best.n || (t.n === best.n && t.last > best.last)) topTheme = theme;
  }

  const goalDone = progress.goalJourney ? Object.values(progress.goalJourney.done) : [];
  return {
    days,
    activeDays: active.size,
    answers: new Set(answers.map(a => a.questionRef)).size,
    journeyStops: [...Object.values(progress.journey), ...goalDone].filter(inWeek).length,
    moments: progress.moments.filter(m => inWeek(m.date)).length,
    xp: progress.xp.events.filter(e => inWeek(e.date)).reduce((s, e) => s + e.amount, 0),
    topTheme,
    badges: progress.achievements.filter(a => inWeek(dateOf(a.unlockedAt))).map(a => a.id),
  };
}

/** Which encouragement fits the week (copy keys). */
export const recapTone = (activeDays: number) =>
  activeDays === 0 ? "quiet" : activeDays <= 2 ? "start" : activeDays <= 5 ? "steady" : "strong";

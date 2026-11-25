import type { AssessmentStatus } from "../assessment/types";
import { dateKey } from "../dates";
import type { View } from "./view";

/**
 * The one step Today recommends. Pure, from real state only: the short daily
 * question comes first, then setting up their own path, then today's journey
 * stop. Everything else stays optional.
 *
 * The day a member's own path begins is the exception: one thing to do, not
 * two. A new member (nothing answered yet, no circle, the assessment not
 * skipped) goes straight to the assessment, then the journey being built,
 * then its first day; the daily question is not recommended that day (it
 * stays one tap away on Today).
 */
export type NextStep =
  | { kind: "daily" }
  | { kind: "assessment"; resume: boolean }
  | { kind: "building" }
  | { kind: "goal"; day: number }
  | { kind: "journey"; day: number }
  | { kind: "rest" };

type NextView = Pick<View, "circle" | "dailyRef" | "dailyDoneByMe" | "goalJourney" | "goalState" | "journey" | "today"> & { facts: Pick<View["facts"], "answered"> };

/** The assessment still has to be offered: no circle, and not accepted or skipped yet. */
export const assessmentOpen = (inCircle: boolean, status: AssessmentStatus | null) =>
  !inCircle && status !== "accepted" && status !== "skipped";

/** Today is the day the member's own path begins: they are setting it up, or its journey was built today. */
export function pathStartsToday(view: NextView, assessment: AssessmentStatus | null): boolean {
  if (view.circle || assessment === "skipped") return false;
  if (view.goalJourney) return dateKey(new Date(view.goalJourney.createdAt)) === view.today;
  return view.facts.answered === 0;
}

export function recommendNext(view: NextView, assessment: AssessmentStatus | null, building: boolean): NextStep {
  if (view.dailyRef && !view.dailyDoneByMe && !pathStartsToday(view, assessment)) return { kind: "daily" };
  if (assessmentOpen(!!view.circle, assessment)) return { kind: "assessment", resume: assessment !== null };
  if (building && !view.goalJourney) return { kind: "building" };
  const goalNext = view.goalState?.next;
  if (goalNext && view.goalState!.stateOf(goalNext.day) === "current") return { kind: "goal", day: goalNext.day };
  // The built-in journey is the member's own without a goal journey, and the circle's shared one in a circle.
  const next = view.journey.next;
  if ((!view.goalJourney || view.circle) && next && view.journey.stateOf(next.day) === "current") return { kind: "journey", day: next.day };
  return { kind: "rest" };
}

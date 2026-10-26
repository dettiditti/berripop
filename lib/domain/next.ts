import type { AssessmentStatus } from "../assessment/types";
import type { View } from "./view";

/**
 * The one step Today recommends. Pure, from real state only: the short daily
 * question comes first (even before the assessment, so a new member gets a
 * quick first win), then setting up their own path, then today's journey stop.
 * Everything else stays optional.
 */
export type NextStep =
  | { kind: "daily" }
  | { kind: "assessment"; resume: boolean }
  | { kind: "building" }
  | { kind: "goal"; day: number }
  | { kind: "journey"; day: number }
  | { kind: "rest" };

type NextView = Pick<View, "circle" | "dailyRef" | "dailyDoneByMe" | "goalJourney" | "goalState" | "journey">;

/** The assessment still has to be offered: no circle, and not accepted or skipped yet. */
export const assessmentOpen = (inCircle: boolean, status: AssessmentStatus | null) =>
  !inCircle && status !== "accepted" && status !== "skipped";

export function recommendNext(view: NextView, assessment: AssessmentStatus | null, building: boolean): NextStep {
  if (view.dailyRef && !view.dailyDoneByMe) return { kind: "daily" };
  if (assessmentOpen(!!view.circle, assessment)) return { kind: "assessment", resume: assessment !== null };
  if (building && !view.goalJourney) return { kind: "building" };
  const goalNext = view.goalState?.next;
  if (goalNext && view.goalState!.stateOf(goalNext.day) === "current") return { kind: "goal", day: goalNext.day };
  // The built-in journey is the member's own without a goal journey, and the circle's shared one in a circle.
  const next = view.journey.next;
  if ((!view.goalJourney || view.circle) && next && view.journey.stateOf(next.day) === "current") return { kind: "journey", day: next.day };
  return { kind: "rest" };
}

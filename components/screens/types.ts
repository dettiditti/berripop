import type { AssessmentStatus } from "@/lib/assessment/types";
import type { AnswerContext, ActionResult, QuestionRef } from "@/lib/domain/types";
import type { View } from "@/lib/domain/view";
import type { Tab } from "../BottomNavigation";

/** Runs a server action, applies the returned snapshot, and reports errors. Resolves to null on failure. */
export type Run = <T>(p: Promise<ActionResult<T>>) => Promise<Extract<ActionResult<T>, { ok: true }> | null>;

/** Utazás shows the member's own journey, or (in a circle) the shared one. */
export type JourneyMode = "own" | "shared";

export type ScreenProps = {
  view: View;
  run: Run;
  notify: (message: string) => void;
  go: (tab: Tab) => void;
  startQuest: (ref: QuestionRef, context: AnswerContext) => void;
  openQuestion: (ref: QuestionRef) => void;
  onInvite: () => void;
  journeyMode: JourneyMode;
  openJourney: (mode: JourneyMode) => void;
  /** Builds (or rebuilds, after goals changed) the journey from the member's goals. */
  buildJourney: () => void;
  journeyBuilding: boolean;
  /** The member's assessment status (null: not started), and opening it. */
  assessmentStatus: AssessmentStatus | null;
  openAssessment: () => void;
  /** Opens a new journal entry starting with this text. */
  writeInJournal: (starter: string) => void;
};

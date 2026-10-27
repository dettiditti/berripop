import type { AssessmentAnswers, Followup, PathPlan } from "./model";

/** The owner's assessment and path steps. Loaded separately from circle data, only for the owner. */

export type AssessmentStatus = "in_progress" | "generating" | "ready" | "accepting" | "accepted" | "skipped";

export type AssessmentDTO = {
  status: AssessmentStatus;
  step: number;
  answers: AssessmentAnswers;
  followups: Followup[];
  plan: PathPlan | null;
  aiCallsLeft: number;
};

export type PathStepDTO = {
  id: string;
  goalId: string | null;
  title: string;
  kind: "first" | "next";
  position: number;
  done: boolean;
};

export type AssessmentState = { assessment: AssessmentDTO | null; steps: PathStepDTO[] };

export type AssessmentError = "unauthorized" | "invalid" | "not_found" | "busy" | "limit_assessment" | "limit_ai" | "ai_unavailable" | "ai_consent_required" | "limit_goals";

export type AssessmentResult = { ok: true; state: AssessmentState } | { ok: false; error: AssessmentError };

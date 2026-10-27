import type { InsightKind, ParsedWeekly } from "./reflection";

/** Journal data is loaded separately from circle data and only ever for its owner. */

export type JournalEntryDTO = {
  id: string;
  body: string;
  status: "draft" | "saved";
  entryDate: string;
  createdAt: string;
  updatedAt: string;
};

export type JournalReflectionDTO = {
  id: string;
  entryId: string;
  noticed: string;
  strength: string | null;
  explore: string;
  nextStep: string | null;
  suggestion: { kind: InsightKind; text: string; goalId: string | null } | null;
  feedback: "helpful" | "not_helpful" | null;
  correction: string | null;
  createdAt: string;
};

export type InsightDTO = {
  id: string;
  kind: InsightKind;
  text: string;
  goalId: string | null;
  sourceEntryId: string | null;
  origin: "user" | "ai_suggested";
  updatedAt: string;
};

export type JournalState = {
  entries: JournalEntryDTO[];
  reflections: JournalReflectionDTO[];
  insights: InsightDTO[];
  usage: { used: number; limit: number; remaining: number; reached: boolean; resets: string };
  weeklyJournal: boolean;
  /** The plan allows saved insights in reflections; each request still needs the owner's opt-in. */
  insightContext: boolean;
  aiConfigured: boolean;
};

export type JournalError = "unauthorized" | "not_found" | "invalid" | "limit_ai" | "ai_unavailable" | "ai_consent_required" | "premium_required";

export type JournalResult<T = undefined> = { ok: true; state: JournalState; data?: T } | { ok: false; error: JournalError };

export type WeeklyJournalDTO = ParsedWeekly;

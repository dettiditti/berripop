import type { Likert, PairChoice, RelationshipReflection, TranslateWho, TranslationResult, TriggerInput, TriggerInsight, WeeklySummary } from "./types";

/** What a weekly summary was made from: counts and labels only, never the member's own text. */
export type SummaryStats = {
  entries: number;
  translations: number;
  feelings: string[];
  reactions: string[];
  needs: string[];
  previousEntries: number;
};

/**
 * What one relationship_records row stores (encrypted). Test rows keep only the
 * answers: the result is computed from them on every read (lib/relationship/scoring.ts),
 * so a result can never drift from its answers.
 */
export type RelationshipRecordData =
  | { v: 1; kind: "love_language"; receive: PairChoice[]; give: PairChoice[] }
  | { v: 1; kind: "attachment"; answers: Likert[] }
  | { v: 1; kind: "trigger"; input: TriggerInput }
  | { v: 1; kind: "translation"; original: string; who: TranslateWho | null; result: TranslationResult }
  | { v: 1; kind: "summary"; week: string; stats: SummaryStats };

export type RelationshipRecordInsight = RelationshipReflection | TriggerInsight | WeeklySummary;

export type RelationshipKind = RelationshipRecordData["kind"];

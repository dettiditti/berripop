import type { Likert, PairChoice, RelationshipReflection, TranslateWho, TranslationResult, TriggerInput, TriggerInsight } from "./types";

/**
 * What one relationship_records row stores (encrypted). Test rows keep only the
 * answers: the result is computed from them on every read (lib/relationship/scoring.ts),
 * so a result can never drift from its answers.
 */
export type RelationshipRecordData =
  | { v: 1; kind: "love_language"; receive: PairChoice[]; give: PairChoice[] }
  | { v: 1; kind: "attachment"; answers: Likert[] }
  | { v: 1; kind: "trigger"; input: TriggerInput }
  | { v: 1; kind: "translation"; original: string; who: TranslateWho | null; result: TranslationResult };

export type RelationshipRecordInsight = RelationshipReflection | TriggerInsight;

export type RelationshipKind = RelationshipRecordData["kind"];

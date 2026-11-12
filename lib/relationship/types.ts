/**
 * Kapcsolati világ (relationship self-knowledge): shared types. Pure, no server
 * imports, so client components, the server and tests can all use them.
 *
 * Nothing here is a diagnosis. Love languages are a popular way of talking
 * about what makes someone feel loved, not a validated personality type, and
 * attachment results are tendencies that can change, never a fixed category.
 */

export const LOVE_LANGUAGES = ["words", "time", "gifts", "acts", "touch"] as const;
export type LoveLanguage = (typeof LOVE_LANGUAGES)[number];
export const isLoveLanguage = (v: unknown): v is LoveLanguage => typeof v === "string" && (LOVE_LANGUAGES as readonly string[]).includes(v);

/** The four commonly described attachment patterns. */
export const ATTACHMENT_PATTERNS = ["secure", "anxious", "avoidant", "fearful"] as const;
export type AttachmentPattern = (typeof ATTACHMENT_PATTERNS)[number];

/** The areas the attachment questions look at. */
export const ATTACHMENT_AREAS = ["closeness", "distance", "rejection", "conflict", "reassurance", "autonomy"] as const;
export type AttachmentArea = (typeof ATTACHMENT_AREAS)[number];

/** Needs that may sit behind a strong reaction (trigger map, translator). */
export const NEEDS = ["safety", "closeness", "respect", "appreciation", "freedom", "honesty", "reliability", "being_heard", "support", "rest"] as const;
export type Need = (typeof NEEDS)[number];
export const isNeed = (v: unknown): v is Need => typeof v === "string" && (NEEDS as readonly string[]).includes(v);

export const FEELINGS = ["hurt", "angry", "anxious", "lonely", "ashamed", "disappointed", "overwhelmed", "jealous", "rejected", "helpless"] as const;
export type Feeling = (typeof FEELINGS)[number];
export const isFeeling = (v: unknown): v is Feeling => typeof v === "string" && (FEELINGS as readonly string[]).includes(v);

export const REACTIONS = ["withdraw", "attack", "explain", "please", "silent", "check", "cry", "leave"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);

/** Premium features a paywall or preview can be about; also the analytics context of premium_* events. */
export const PREMIUM_FEATURES = ["relationship", "love_detail", "attachment_detail", "reflection", "trigger", "translator", "growth"] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export const TRANSLATE_WHO = ["partner", "friend", "family", "work"] as const;
export type TranslateWho = (typeof TRANSLATE_WHO)[number];
export const isTranslateWho = (v: unknown): v is TranslateWho => typeof v === "string" && (TRANSLATE_WHO as readonly string[]).includes(v);

/** A love-language answer: the left option, both alike, or the right option. */
export type PairChoice = "a" | "both" | "b";
/** An attachment answer: 1 (not like me at all) … 5 (very much like me). */
export type Likert = 1 | 2 | 3 | 4 | 5;

export type LoveLanguageScores = Record<LoveLanguage, number>;

/** What every member sees after the love-language test. */
export type LoveLanguageResult = {
  /** Percent split of how the member likes to RECEIVE love (sums to 100). */
  receive: LoveLanguageScores;
  /** Percent split of how they tend to GIVE love (sums to 100). */
  give: LoveLanguageScores;
  /** The one or two strongest receiving languages (two when they are close). */
  top: LoveLanguage[];
  topGive: LoveLanguage;
};

/** Premium only: computed on the server, sent only to members who have it. */
export type LoveLanguageDetail = {
  /** Languages where giving and receiving differ by at least GAP_NOTABLE points, biggest first. */
  gaps: { lang: LoveLanguage; give: number; receive: number }[];
  /** The member gives most in a language they need least: a common source of "I do so much and it isn't seen". */
  mismatch: boolean;
  /** Receiving order, strongest first. */
  order: LoveLanguage[];
};

export type AttachmentResult = {
  /** 0–100: how much worry about closeness and rejection shows in the answers. */
  anxiety: number;
  /** 0–100: how much keeping distance and self-reliance shows in the answers. */
  avoidance: number;
  /** Leaning towards each pattern in percent (sums to 100). Never a single label. */
  leaning: Record<AttachmentPattern, number>;
  /** The strongest leaning, or null when no pattern clearly stands out. */
  main: AttachmentPattern | null;
  /** True when a score sits near the middle: the result may tip either way. */
  borderline: boolean;
};

/** Premium only: area-by-area picture, computed on the server. */
export type AttachmentDetail = {
  /** 0–100 per area: how tender this area seems (higher = more worry or more distance). */
  areas: Record<AttachmentArea, number>;
  /** The two most tender areas. */
  tender: AttachmentArea[];
  /** The two steadiest areas. */
  steady: AttachmentArea[];
};

/** AI personal reflection on a test result (Premium). */
export type RelationshipReflection = {
  v: 1;
  summary: string;
  strengths: string[];
  tender: string[];
  tryThis: string[];
};

export type TriggerInput = {
  situation: string;
  feelings: Feeling[];
  thought: string;
  reactions: Reaction[];
  reactionNote: string;
};

/** AI view of one trigger (Premium). */
export type TriggerInsight = {
  v: 1;
  needs: Need[];
  reflection: string;
  alternative: string;
};

export type TranslationResult = {
  v: 1;
  feeling: string;
  need: string;
  calm: string;
  direct: string;
  why: string;
};

export type LoveLanguageRecordDTO = { id: string; createdAt: string; result: LoveLanguageResult; detail: LoveLanguageDetail | null; reflection: RelationshipReflection | null };
export type AttachmentRecordDTO = { id: string; createdAt: string; result: AttachmentResult; detail: AttachmentDetail | null; reflection: RelationshipReflection | null };
export type TriggerRecordDTO = { id: string; createdAt: string; input: TriggerInput; insight: TriggerInsight | null };
export type TranslationRecordDTO = { id: string; createdAt: string; original: string; who: TranslateWho | null; result: TranslationResult };

/** Recurring patterns across the member's own trigger entries (deterministic counts). */
export type TriggerPatterns = {
  entries: number;
  feelings: { id: Feeling; count: number }[];
  reactions: { id: Reaction; count: number }[];
  needs: { id: Need; count: number }[];
};

/** AI weekly growth summary (Premium, on request, at most one per week). */
export type WeeklySummary = {
  v: 1;
  summary: string;
  noticed: string[];
  progress: string;
  nextStep: string;
};

/** One week of the member's own activity, counted (never guessed). `week` is an ISO week like 2026-W46. */
export type GrowthWeek = { week: string; start: string; triggers: number; translations: number; topFeeling: Feeling | null; topNeed: Need | null };

export type SummaryRecordDTO = { id: string; createdAt: string; week: string; summary: WeeklySummary };

/** The weekly reflection question: a list in the copy and an index in it, chosen from the member's results. */
export type GrowthQuestionTag = LoveLanguage | AttachmentPattern | "general";
export type GrowthQuestion = { tag: GrowthQuestionTag; index: number };

/** The growth path (Premium). */
export type GrowthState = {
  /** The current ISO week. */
  week: string;
  question: GrowthQuestion;
  /** The last four weeks, oldest first. */
  weeks: GrowthWeek[];
  /** Saved summaries, newest first. */
  summaries: SummaryRecordDTO[];
  /** A summary for this week already exists. */
  doneThisWeek: boolean;
  /** There is something from the last seven days to summarise. */
  hasActivity: boolean;
  /** The previous results of each test, for comparison (null before the second test). */
  previousLove: { createdAt: string; result: LoveLanguageResult } | null;
  previousAttachment: { createdAt: string; result: AttachmentResult } | null;
};

export type RelationshipState = {
  enabled: boolean;
  aiConfigured: boolean;
  /** Premium-like access: a paid plan or the running trial. */
  premium: boolean;
  plan: string;
  tier: string;
  quota: { used: number; limit: number; remaining: number; window: "week" | "month" | "once"; resets: string | null };
  loveLanguage: LoveLanguageRecordDTO | null;
  attachment: AttachmentRecordDTO | null;
  /** Premium only (empty on Free). */
  triggers: TriggerRecordDTO[];
  patterns: TriggerPatterns | null;
  translations: TranslationRecordDTO[];
  /** Free: whether the one free translation is still available. */
  freeTranslationLeft: boolean;
  /** Each test can be taken again once a month: the date (YYYY-MM-DD) from when, or null when it can be taken now. */
  retest: { love: string | null; attachment: string | null };
  /** Premium only (null on Free). */
  growth: GrowthState | null;
};

export type RelationshipError =
  | "unauthorized" | "disabled" | "invalid" | "not_found" | "premium_required"
  | "limit_ai" | "ai_unavailable" | "ai_consent_required" | "ai_failed" | "safety"
  | "too_soon" | "nothing_yet";

export type RelationshipResult<T = undefined> = { ok: true; data: T; state: RelationshipState } | { ok: false; error: RelationshipError; state?: RelationshipState };

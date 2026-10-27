import type { CheckinNeed, CheckinState, CheckinTopic } from "../checkin/checkin";
import type { Entitlements } from "../billing/entitlements";
import type { GoalJourneyDay, GoalJourneyWeek } from "../journey/goal";

/**
 * Data shapes shared by the server (which builds them from the database) and
 * the client (which only renders them). Other members' answer text appears
 * only in `sharedAnswers`, and only for answers their authors chose to share.
 */

/** A built-in question id ("j01", "l03") or a custom one ("c:<uuid>"). */
export type QuestionRef = string;

export const REACTIONS = ["heart", "hug", "spark", "laugh"] as const;
export type Reaction = (typeof REACTIONS)[number];

export type ReactionSummary = { counts: Partial<Record<Reaction, number>>; mine: Reaction[] };

export type MemberDTO = {
  id: string;
  name: string;
  role: "owner" | "member";
  joinedAt: string;
  isMe: boolean;
};

export type AnswerDTO = {
  id: string;
  questionRef: QuestionRef;
  text: string;
  reflectionPrompt: string;
  reflection: string;
  shared: boolean;
  date: string;
  updatedAt: string;
  reactions: ReactionSummary;
};

export type SharedAnswerDTO = {
  id: string;
  authorId: string;
  questionRef: QuestionRef;
  text: string;
  reflectionPrompt: string;
  reflection: string;
  sharedAt: string;
  reactions: ReactionSummary;
};

export type CustomQuestionDTO = {
  ref: QuestionRef;
  text: string;
  theme: string;
  category: string;
  authorId: string;
};

export type FeedEventType =
  | "circle_created"
  | "member_joined"
  | "daily_completed"
  | "journey_completed"
  | "shared_journey_completed"
  | "answer_shared"
  | "question_added"
  | "milestone_unlocked";

export type FeedEventDTO = { id: string; type: FeedEventType; actorId: string | null; ref: string; createdAt: string };

export type XpEventDTO = { reason: string; amount: number; ref: string; theme: string | null };

export type CircleDTO = {
  id: string;
  name: string;
  role: "owner" | "member";
  inviteCode: string;
  createdAt: string;
  members: MemberDTO[];
  /** Circle-local date (Europe/Budapest), "YYYY-MM-DD". */
  today: string;
  daily: { questionRef: QuestionRef; completedBy: string[] };
  circleQuestions: { ref: QuestionRef; addedBy: string }[];
  customQuestions: CustomQuestionDTO[];
  myAnswers: AnswerDTO[];
  sharedAnswers: SharedAnswerDTO[];
  /** Participation facts only (no text): who completed what, and on which date. */
  participation: {
    journey: Record<string, Record<number, string>>;
    daily: Record<string, string[]>;
  };
  sharedJourney: Record<number, string>;
  xp: { mine: number; circle: number; myEvents: XpEventDTO[] };
  achievements: { id: string; unlockedAt: string }[];
  milestones: { id: string; unlockedAt: string }[];
  feed: FeedEventDTO[];
};

export type GoalDTO = {
  id: string;
  title: string;
  details: string;
  source: "guided" | "reflection" | "custom";
  status: "active" | "paused";
  createdAt: string;
};

/** The member's plan, allowances and goals. Computed on the server from trusted state. */
export type AccountDTO = {
  entitlements: Entitlements;
  ai: { used: number; limit: number; remaining: number; reached: boolean; resets: string };
  goals: GoalDTO[];
  ownedCircles: number;
  hasBillingCustomer: boolean;
  billingConfigured: boolean;
  aiConfigured: boolean;
};

/**
 * The member's own progress, the same with or without a circle: one journey,
 * one XP total, one set of badges. Built only from the member's own records.
 */
export type ProgressDTO = {
  /** Local date (Europe/Budapest), "YYYY-MM-DD". */
  today: string;
  /** Journey day → date it was completed. */
  journey: Record<number, string>;
  /** Dates the member completed a daily question (own or circle). */
  daily: string[];
  /** Today's own question; null for members of a circle (they answer the circle's). */
  dailyQuestion: { questionRef: QuestionRef; done: boolean } | null;
  /** Answers on the member's own path (not in a circle). */
  answers: AnswerDTO[];
  /** Every question the member has answered or completed anywhere (refs only, no text): badges and the world. */
  answeredRefs: QuestionRef[];
  xp: { total: number; today: number; events: (XpEventDTO & { date: string })[] };
  /** Dates with any activity: streaks. */
  activeDates: string[];
  achievements: { id: string; unlockedAt: string }[];
  moments: MomentDTO[];
  /** The member's own journey built from their goals (null until they build one). */
  goalJourney: GoalJourneyDTO | null;
  /** The member has active goals, so a goal journey can be built. */
  canBuildJourney: boolean;
  /** Today's check-in, if the member did one (never earns XP or counts for streaks). */
  checkin: CheckinDTO | null;
};

export type CheckinDTO = {
  date: string;
  state: CheckinState | null;
  topics: CheckinTopic[];
  note: string;
  need: CheckinNeed | null;
  /** The AI follow-up the member asked for ("think it through together"). */
  aiReply: { heard: string; question: string; idea: string | null } | null;
  updatedAt: string;
};

export type GoalJourneyDTO = {
  id: string;
  createdAt: string;
  goals: string[];
  weeks: GoalJourneyWeek[];
  days: GoalJourneyDay[];
  /** Day → date it was completed. */
  done: Record<number, string>;
  /** The member's goals changed since it was built: a rebuild is offered. */
  outdated: boolean;
};

/** A private "My Inner World" moment. Only its owner ever receives it. */
export type MomentDTO = {
  id: string;
  date: string;
  createdAt: string;
  words: string[];
  ownWords: string[];
  promptId: string | null;
  note: string;
};

export type Snapshot = {
  /** `personalPath`: the member chose to start on their own (My Path) without a circle. */
  me: { id: string; name: string; locale: string | null; personalPath: boolean };
  circles: { id: string; name: string; role: "owner" | "member" }[];
  circle: CircleDTO | null;
  saved: QuestionRef[];
  account: AccountDTO;
  progress: ProgressDTO;
};

export type AnswerContext = { kind: "daily" } | { kind: "journey"; day: number } | { kind: "goal"; day: number } | { kind: "bonus" };

export type RewardDTO = {
  questionRef: QuestionRef;
  context: AnswerContext["kind"];
  isNew: boolean;
  shared: boolean;
  xpItems: { reason: string; amount: number; theme?: string }[];
  xpBefore: number;
  xpAfter: number;
  newAchievements: string[];
  newMilestones: string[];
  journeyDay: number | null;
  weekCompleted: number | null;
  sharedDayCompleted: number | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; snapshot: Snapshot; data?: T }
  | { ok: false; error: ActionError };

export type ActionError =
  | "unauthorized"
  | "not_member"
  | "not_owner"
  | "invalid"
  | "not_found"
  | "locked"
  | "owner_cannot_leave"
  | "limit_goals"
  | "limit_ai"
  | "limit_circles"
  | "premium_required"
  | "already_premium"
  | "billing_unavailable"
  | "ai_unavailable"
  | "ai_consent_required";

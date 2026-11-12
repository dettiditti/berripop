import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { encryptedJson, encryptedText } from "./encryption";
import type { ThoughtMap, ThoughtMessage, ThoughtSummary, ViewpointId } from "../thought/types";
import type { RelationshipRecordData, RelationshipRecordInsight } from "../relationship/records";

/**
 * Berripop data model. Privacy rule: answer text is only ever read by its author,
 * or by circle members once `sharedAt` is set. Activity events never carry
 * answer text.
 */

/** Mirrors the Clerk user; `id` is the Clerk user id. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  /** Where the account was created: "web" (the website) or "appstore" (the iPhone app). Set once, never changed. */
  signupSource: text("signup_source", { enum: ["web", "appstore"] }).notNull().default("web"),
  /** Optional, shared by the member (lib/profile/model): only shapes the tone of AI answers. */
  ageRange: text("age_range", { enum: ["16_17", "18_24", "25_34", "35_44", "45_54", "55_plus"] }),
  gender: text("gender", { enum: ["woman", "man", "other", "unsaid"] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const circles = pgTable("circles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  inviteCode: text("invite_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("circles_invite_code_idx").on(t.inviteCode)]);

export const circleMembers = pgTable("circle_members", {
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.circleId, t.userId] }), index("circle_members_user_idx").on(t.userId)]);

/** Questions people write themselves. Built-in questions live in code + dictionaries. */
export const customQuestions = pgTable("custom_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  theme: text("theme").notNull(),
  category: text("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Questions a member added to the circle's shared list. `questionRef` is a built-in id or "c:<uuid>". */
export const circleQuestions = pgTable("circle_questions", {
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  questionRef: text("question_ref").notNull(),
  addedBy: text("added_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.circleId, t.questionRef] })]);

export const savedQuestions = pgTable("saved_questions", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questionRef: text("question_ref").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.questionRef] })]);

/**
 * One answer per member, circle and question; `circleId` is null for answers on
 * the member's own path (one per question). Private until `sharedAt` is set by the author.
 */
export const answers = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  circleId: uuid("circle_id").references(() => circles.id, { onDelete: "cascade" }),
  questionRef: text("question_ref").notNull(),
  // Encrypted at rest (lib/db/encryption.ts), like every column marked encrypted* below.
  text: encryptedText("text").notNull(),
  reflectionPrompt: encryptedText("reflection_prompt").notNull().default(""),
  reflection: encryptedText("reflection").notNull().default(""),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("answers_user_circle_question_idx").on(t.userId, t.circleId, t.questionRef),
  uniqueIndex("answers_user_personal_question_idx").on(t.userId, t.questionRef).where(sql`${t.circleId} is null`),
  index("answers_circle_idx").on(t.circleId),
]);

export const answerReactions = pgTable("answer_reactions", {
  answerId: uuid("answer_id").notNull().references(() => answers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.answerId, t.userId, t.emoji] })]);

/** The circle's question of the day, fixed once picked so every member sees the same one. */
export const dailyQuests = pgTable("daily_quests", {
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  questionRef: text("question_ref").notNull(),
}, t => [primaryKey({ columns: [t.circleId, t.date] })]);

/**
 * Individual participation records. kind "daily": key = date; kind "journey": key = day number.
 * Kept even if the answer is later deleted, so completions and rewards are never lost.
 */
export const participations = pgTable("participations", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["daily", "journey"] }).notNull(),
  key: text("key").notNull(),
  questionRef: text("question_ref").notNull(),
  date: text("date").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.circleId, t.kind, t.key] }), index("participations_circle_idx").on(t.circleId)]);

/** A journey day becomes shared-complete once every member (2+) has completed it. Never removed. */
export const sharedJourneyDays = pgTable("shared_journey_days", {
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.circleId, t.day] })]);

/** XP ledger. `ref` is unique per circle, so the same reward can never be granted twice. */
export const xpEvents = pgTable("xp_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  /** Null for circle-wide (shared) rewards. */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  amount: integer("amount").notNull(),
  ref: text("ref").notNull(),
  theme: text("theme"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("xp_events_circle_ref_idx").on(t.circleId, t.ref)]);

export const achievements = pgTable("achievements", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.circleId, t.achievementId] })]);

export const circleMilestones = pgTable("circle_milestones", {
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  milestoneId: text("milestone_id").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.circleId, t.milestoneId] })]);

/** Activity feed. Never stores answer text: only who did what, and references. */
export const circleEvents = pgTable("circle_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  ref: text("ref").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("circle_events_circle_idx").on(t.circleId, t.createdAt)]);

/**
 * Things the member picked for Berri with stars (lib/wardrobe): one row per
 * item. Stars themselves are not stored: they are counted from activity, and
 * what was spent is the price of the items here. Never holds personal content.
 */
export const berriItems = pgTable("berri_items", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  /** Worn by Berri (head items: at most one) or out in the world. */
  equipped: boolean("equipped").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.itemId] })]);

export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  locale: text("locale").notNull().default("hu"),
  lastCircleId: uuid("last_circle_id"),
  onboarded: boolean("onboarded").notNull().default(false),
  /** Berri's world backdrop: "meadow", "city" or "exotic" (lib/world SCENES). */
  scene: text("scene", { enum: ["meadow", "city", "exotic"] }).notNull().default("meadow"),
  /** The member chose a backdrop, or closed the one-time "Berri can move" popup. */
  scenePicked: boolean("scene_picked").notNull().default(false),
});

/* ---------- Subscriptions & usage ---------- */

/**
 * One row per user, mirroring the authoritative Stripe subscription. Written
 * only from server-side Stripe API reads (webhooks or verified checkout).
 */
export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planId: text("plan_id").notNull().default("free"),
  /** Stripe subscription status, or "none" before any subscription exists. */
  status: text("status").notNull().default("none"),
  interval: text("interval"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("subscriptions_customer_idx").on(t.stripeCustomerId)]);

/**
 * App Store (in-app purchase) subscriptions, one row per subscription
 * (Apple's original transaction id). Written only from transactions and
 * notifications whose Apple signature was verified on the server. The Stripe
 * table above is separate; entitlements combine the two.
 */
export const appleSubscriptions = pgTable("apple_subscriptions", {
  originalTransactionId: text("original_transaction_id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  planId: text("plan_id").notNull(),
  interval: text("interval"),
  /** active | grace (billing grace period) | billing_retry | expired | revoked */
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(true),
  /** "Production" or "Sandbox" (TestFlight and test purchases). */
  environment: text("environment").notNull(),
  /** Apple's signedDate of the newest data applied, so an older notification never overwrites a newer state. */
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("apple_subscriptions_user_idx").on(t.userId)]);

/** Processed App Store Server Notifications, for idempotency. */
export const appleNotifications = pgTable("apple_notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Processed Stripe webhook events, for idempotency. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** AI allowance counter per user and period (see lib/billing/plans.ts for the reset policy). */
export const aiUsage = pgTable("ai_usage", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  count: integer("count").notNull().default(0),
}, t => [primaryKey({ columns: [t.userId, t.period] })]);

/**
 * One row per use of an AI allowance (replaces counting in ai_usage). `quota`
 * is the allowance (assist, journal, assessment, thought), `period` the pool
 * it was charged to: a week ("week:2026-11-09"), a month ("month:2026-11") or
 * a one-time pool ("once:first"). The count of rows in a period is the usage.
 *
 * `idem_key` makes a charge idempotent: the same key is never charged twice
 * (a repeated or parallel request finds the row). It is cleared once an AI
 * request has finished, so a deliberate new request can be charged again;
 * one-time pools keep theirs (a session is charged once, ever). Refunding a
 * failed call deletes exactly its row. Never holds content.
 */
export const quotaUses = pgTable("quota_uses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  quota: text("quota").notNull(),
  period: text("period").notNull(),
  idemKey: text("idem_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("quota_uses_user_period_idx").on(t.userId, t.quota, t.period),
  uniqueIndex("quota_uses_idem_idx").on(t.userId, t.idemKey),
]);

/**
 * One-time grants per account, e.g. the 4-day Premium trial ("premium_trial").
 * The primary key makes each grant startable once per account; it does not
 * come back after signing out or reinstalling. No card, no renewal: when
 * `ends_at` passes the member is simply on Free again. `completed_at` marks
 * that the end was recorded for analytics.
 */
export const entitlementGrants = pgTable("entitlement_grants", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.userId, t.kind] })]);

/**
 * AI cost tracking: token counts, estimated cost and outcome only, never
 * prompts or answers. Token counts come from the provider; null = not reported
 * (e.g. a failed call). Cost is an estimate in micro-USD from lib/ai/prices.ts;
 * null = unknown (unlisted model or missing tokens).
 */
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cacheReadTokens: integer("cache_read_tokens"),
  cacheWriteTokens: integer("cache_write_tokens"),
  costMicroUsd: integer("cost_micro_usd"),
  priceVersion: text("price_version"),
  status: text("status", { enum: ["ok", "error", "timeout", "parse_failed"] }).notNull().default("ok"),
  errorKind: text("error_kind"),
  attempts: integer("attempts").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("ai_calls_user_created_idx").on(t.userId, t.createdAt)]);

export const growthGoals = pgTable("growth_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  /** How it was created: guided suggestion, free-text reflection, or own goal. */
  source: text("source", { enum: ["guided", "reflection", "custom"] }).notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("growth_goals_user_idx").on(t.userId)]);

/** Privacy-safe subscription funnel events: event names and plan facts only, never user content. */
export const funnelEvents = pgTable("funnel_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  event: text("event").notNull(),
  plan: text("plan"),
  interval: text("interval"),
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("funnel_events_event_idx").on(t.event, t.createdAt)]);

/* ---------- Daily journal ---------- */

/** Private journal entries. Only ever read by their owner; never shown to circles or sent to analytics. */
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: encryptedText("body").notNull(),
  status: text("status", { enum: ["draft", "saved"] }).notNull().default("draft"),
  /** Local date (Europe/Budapest) the entry belongs to. */
  entryDate: text("entry_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("journal_entries_user_idx").on(t.userId, t.entryDate)]);

/** AI reflections on an entry, only created when the owner asks. Deleted with the entry. */
export const journalReflections = pgTable("journal_reflections", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  noticed: encryptedText("noticed").notNull(),
  strength: encryptedText("strength"),
  explore: encryptedText("explore").notNull(),
  nextStep: encryptedText("next_step"),
  /** Other possible readings, phrased as possibilities. */
  alternatives: encryptedJson<string[]>()("alternatives").notNull().default([]),
  /** The support mode the person chose for this reflection (listen | reflect | practical). */
  mode: text("mode"),
  /** Optional suggested link to a growth goal; nothing is saved from it without confirmation. */
  suggestionKind: text("suggestion_kind"),
  suggestionText: encryptedText("suggestion_text"),
  suggestionGoalId: uuid("suggestion_goal_id"),
  feedback: text("feedback", { enum: ["helpful", "not_helpful"] }),
  correction: encryptedText("correction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("journal_reflections_entry_idx").on(t.entryId)]);

/**
 * The feeling sticker a member pinned to an entry (optional, one per entry).
 * A separate table, so journal_entries stays exactly as it is and the journal
 * keeps working before this migration has run. Private like the entry itself.
 */
export const journalMoods = pgTable("journal_moods", {
  entryId: uuid("entry_id").primaryKey().references(() => journalEntries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mood: text("mood").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("journal_moods_user_idx").on(t.userId)]);

/**
 * Growth insights the user explicitly approved (or wrote). Kept separate from
 * journal entries; only these may personalize later AI suggestions.
 */
export const growthInsights = pgTable("growth_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["theme", "question", "exercise", "quest"] }).notNull(),
  text: encryptedText("text").notNull(),
  goalId: uuid("goal_id").references(() => growthGoals.id, { onDelete: "set null" }),
  sourceEntryId: uuid("source_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  origin: text("origin", { enum: ["user", "ai_suggested"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("growth_insights_user_idx").on(t.userId)]);


/* ---------- Gondolatboncoló (thought dissector) ---------- */

/**
 * One guided self-reflection session. Private: only ever read by its owner.
 * Problem, messages, summary and map are encrypted at rest. `start_key` makes
 * starting idempotent (a double click or a retried request finds the same
 * session); `ai_turns` caps the AI calls per session; `locked_until` lets only
 * one turn run at a time. Saving to the journal happens only on request.
 */
export const thoughtSessions = pgTable("thought_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** The journal entry it started from, if any (kept when the entry is deleted, without the link). */
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  /** The journal entry the member saved the result into, if they did. */
  savedEntryId: uuid("saved_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  startKey: text("start_key").notNull(),
  status: text("status", { enum: ["draft", "starting", "active", "completed", "safety_stop"] }).notNull().default("draft"),
  problem: encryptedText("problem").notNull(),
  messages: encryptedJson<ThoughtMessage[]>()("messages").notNull().default([]),
  viewpoints: jsonb("viewpoints").$type<ViewpointId[]>().notNull().default([]),
  done: jsonb("done").$type<ViewpointId[]>().notNull().default([]),
  summary: encryptedJson<ThoughtSummary | null>()("summary"),
  map: encryptedJson<ThoughtMap | null>()("map"),
  /** The plan when the session started; limits stay as they were for this session. */
  plan: text("plan").notNull(),
  aiTurns: integer("ai_turns").notNull().default(0),
  turnLimit: integer("turn_limit").notNull(),
  /** The monthly period whose allowance this session used (null while it is a draft). */
  quotaPeriod: text("quota_period"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("thought_sessions_start_key_idx").on(t.userId, t.startKey),
  index("thought_sessions_user_idx").on(t.userId, t.updatedAt),
  index("thought_sessions_entry_idx").on(t.journalEntryId),
]);

/* ---------- Kapcsolati világ (relationship self-knowledge) ---------- */

/**
 * The member's relationship test results, trigger-map entries and
 * translations and weekly growth summaries. Kept apart from the journal and encrypted at rest: answers
 * and AI text are sensitive. Never analysed automatically, never used for
 * marketing; exported with the account and deleted with it (cascade).
 */
export const relationshipRecords = pgTable("relationship_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["love_language", "attachment", "trigger", "translation", "summary"] }).notNull(),
  /** The member's own input (test answers, a trigger entry, a sentence) and the computed result. */
  data: encryptedJson<RelationshipRecordData>()("data").notNull(),
  /** AI text for this record (a reflection, a trigger insight), when the member asked for one. */
  insight: encryptedJson<RelationshipRecordInsight | null>()("insight"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("relationship_records_user_idx").on(t.userId, t.kind, t.createdAt),
]);

/* ---------- My Path: initial assessment and steps ---------- */

/**
 * One initial assessment per user. Answers are saved at every step, so nothing
 * is lost if an AI call fails or the user leaves; `ai_calls` caps the AI
 * requests per assessment. Private: only ever read by its owner.
 */
export const pathAssessments = pgTable("path_assessments", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["in_progress", "generating", "ready", "accepting", "accepted", "skipped"] }).notNull().default("in_progress"),
  step: integer("step").notNull().default(0),
  answers: jsonb("answers").notNull().default({}),
  followups: jsonb("followups").notNull().default([]),
  plan: jsonb("plan"),
  aiCalls: integer("ai_calls").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

/** Concrete steps of the member's path, created when they accept a plan. */
export const growthSteps = pgTable("growth_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => growthGoals.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["first", "next"] }).notNull(),
  position: integer("position").notNull(),
  status: text("status", { enum: ["todo", "done"] }).notNull().default("todo"),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("growth_steps_user_idx").on(t.userId, t.position)]);

/* ---------- Personal progress (with or without a circle) ---------- */

/**
 * The member's own journey and daily completions, wherever they happened (own
 * path or any circle): one record per journey day and per daily date. This is
 * the single journey a member walks; circles read it to find shared days.
 */
export const userActivity = pgTable("user_activity", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["daily", "journey", "goal"] }).notNull(),
  /** "daily": the date; "journey": the built-in journey's day number; "goal": "<goal journey id>:<day>". */
  key: text("key").notNull(),
  questionRef: text("question_ref").notNull(),
  date: text("date").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.kind, t.key] })]);

/**
 * Personal XP ledger, independent of circles. `ref` is unique per member, so a
 * reward earned in two places (own path and a circle) counts once. Never stores content.
 */
export const userXpEvents = pgTable("user_xp_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  amount: integer("amount").notNull(),
  ref: text("ref").notNull(),
  theme: text("theme"),
  /** Local date (Europe/Budapest) it was earned on: streaks and the daily cap. */
  date: text("date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("user_xp_events_user_ref_idx").on(t.userId, t.ref), index("user_xp_events_user_date_idx").on(t.userId, t.date)]);

/** Personal badges. Kept when the member leaves or deletes a circle. */
export const userAchievements = pgTable("user_achievements", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.achievementId] })]);

/** Today's question for a member without a circle (members of a circle get the circle's). */
export const personalDailyQuests = pgTable("personal_daily_quests", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  questionRef: text("question_ref").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.date] })]);

/**
 * "My Inner World" moments: feeling words and an optional note. Private: only
 * ever read by their owner, never shared, scored, sent to analytics or to the AI.
 */
export const worldMoments = pgTable("world_moments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Id the moment had on the device, so importing local moments is idempotent. */
  clientId: text("client_id"),
  date: text("date").notNull(),
  words: jsonb("words").$type<string[]>().notNull().default([]),
  ownWords: encryptedJson<string[]>()("own_words").notNull().default([]),
  promptId: text("prompt_id"),
  note: encryptedText("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("world_moments_user_idx").on(t.userId, t.createdAt), uniqueIndex("world_moments_user_client_idx").on(t.userId, t.clientId)]);

/**
 * The daily check-in, one per member per day (Europe/Budapest), editable that
 * day. Kept apart from world_moments: a check-in can be sent to the AI when
 * the member asks ("think it through together"), moments never are. Never
 * earns XP or counts towards a streak.
 */
export const dailyCheckins = pgTable("daily_checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  state: text("state"),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  note: encryptedText("note").notNull().default(""),
  need: text("need"),
  /** The AI follow-up the member asked for, if any (cleared when the check-in changes). */
  aiReply: encryptedJson<{ heard: string; question: string; idea: string | null } | null>()("ai_reply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("daily_checkins_user_date_idx").on(t.userId, t.date)]);

/**
 * The member's own 21-day journey, written by the AI from their goals when
 * they ask (or accept a plan). One active journey per member; rebuilding it
 * archives the old one. Progress is in user_activity (kind "goal").
 */
export const goalJourneys = pgTable("goal_journeys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Goal titles it was built from, to offer a rebuild when they change. */
  goals: jsonb("goals").$type<string[]>().notNull(),
  weeks: jsonb("weeks").notNull(),
  days: jsonb("days").notNull(),
  locale: text("locale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, t => [uniqueIndex("goal_journeys_active_idx").on(t.userId).where(sql`${t.archivedAt} is null`)]);

/* ---------- Legal records ---------- */

/**
 * Append-only log of what a member accepted, consented to or was shown, per
 * document type and version. The current state is the latest row per kind;
 * a withdrawal is a row with `granted` false. Kinds: "terms" (mandatory
 * Terms of Service acceptance), "ai_processing" (optional consent to AI
 * processing), "checkout_disclosure" (the pre-payment notice shown when a
 * checkout starts; `context` holds the Checkout Session id).
 */
export const legalRecords = pgTable("legal_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  granted: boolean("granted").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("legal_records_user_kind_idx").on(t.userId, t.kind, t.createdAt)]);

/* ---------- Hungarian invoicing ---------- */

/**
 * One row per invoicing operation (issue, reverse, or a correction needing an
 * operator), keyed by a unique `operation_key` derived from Stripe ids, so a
 * repeated webhook never creates a second invoice. Doubles as the durable job:
 * `status` moves pending → processing → issued, or to failed / needs_review.
 * Financial records outlive the account (`user_id` set null on deletion).
 * Buyer details are read from Stripe when the invoice is issued, not stored
 * here; card data never is.
 */
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  operationKey: text("operation_key").notNull(),
  /** "invoice" | "storno" | "correction" */
  kind: text("kind").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  /** Refund or dispute id for storno and correction rows. */
  stripeReversalId: text("stripe_reversal_id"),
  /** Minor units, as Stripe reports them (HUF × 100). */
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  /** The approved VAT key used (e.g. "AAM"), recorded when issued. */
  vatKey: text("vat_key"),
  /** For storno and correction rows: the invoice row they correct. */
  originalInvoiceId: uuid("original_invoice_id"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  /** Sanitised reason (error code and short text, never buyer data). */
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Stable external id for this operation (reserved for a later invoicing integration). */
  providerExternalId: text("provider_external_id").notNull(),
  /** Number of the invoice (or storno / correction) the operator issued by hand. */
  providerInvoiceNumber: text("provider_invoice_number"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("invoices_operation_key_idx").on(t.operationKey),
  uniqueIndex("invoices_external_id_idx").on(t.providerExternalId),
  index("invoices_status_idx").on(t.status, t.nextAttemptAt),
  index("invoices_stripe_invoice_idx").on(t.stripeInvoiceId),
  index("invoices_user_idx").on(t.userId),
]);

/**
 * Phones that asked for the daily reminder (the iPhone app). One row per
 * device token; switching the reminder off deletes the row, and so does
 * deleting the account. The reminder itself never carries any content.
 */
export const pushDevices = pgTable("push_devices", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["ios"] }).notNull().default("ios"),
  /** The phone's local date the last reminder went out, so it is sent at most once a day. */
  lastSentDate: text("last_sent_date"),
  /** The phone's IANA time zone, so the chosen hours are the member's own local hours. */
  timeZone: text("time_zone").notNull().default("Europe/Budapest"),
  /** The afternoon "Don't forget yourself" reminder (lib/push/reminder), skipped on days the member was active. */
  remind: boolean("remind").notNull().default(true),
  remindHour: integer("remind_hour").notNull().default(17),
  /** Berri's thought of the day (lib/push/thoughts), in the morning. */
  thought: boolean("thought").notNull().default(true),
  thoughtHour: integer("thought_hour").notNull().default(8),
  /** Pick the thought by the member's chosen areas, check-in mood and feedback (never the journal). Off: everyone's general thought. */
  personalize: boolean("personalize").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("push_devices_user_idx").on(t.userId)]);

/**
 * One row per member, notification kind and local date it went out: the
 * database-level guarantee that each kind reaches a member at most once a
 * day, even when the hourly job runs twice at once. Holds no content and no
 * device token; rows older than a few days are deleted by the job itself.
 */
export const pushSends = pgTable("push_sends", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["thought", "remind"] }).notNull(),
  date: text("date").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.kind, t.date] })]);

/**
 * Website visitors who asked to hear when the phone app launches. Kept apart
 * from accounts on purpose (no user id): the address, the language, when, and
 * which consent wording was ticked (lib/waitlist.ts). The address is used for
 * the launch notice only; rows are deleted after it goes out, or on request.
 */
export const appWaitlist = pgTable("app_waitlist", {
  email: text("email").primaryKey(),
  locale: text("locale", { enum: ["hu", "en"] }).notNull(),
  consentVersion: text("consent_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

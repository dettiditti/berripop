import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { funnelEvents } from "../db/schema";
import { CIRCLE_TIME_ZONE } from "../domain/rules";

/**
 * Privacy-safe product and subscription funnel tracking. Only an allowlisted
 * event name and plan facts are stored: never answers, reflections, goals or
 * AI text. See docs/analytics.md for what each event means and how retention
 * is read from them.
 */
export const FUNNEL_EVENTS = [
  "signup_completed",
  // Sign-up page, before an account exists: anonymous, no user id (components/auth/SignUpTracker.tsx).
  "signup_page_viewed",
  "signup_form_started",
  "signup_submitted",
  "signup_social_clicked",
  "signup_verify_viewed",
  "signup_error_shown",
  "first_goal_created",
  "first_entry_saved",
  "first_reflection_received",
  "assessment_started",
  "assessment_plan_ready",
  "path_accepted",
  "goal_journey_built",
  "goal_journey_rebuilt",
  "pricing_viewed",
  "upgrade_prompt_shown",
  "upgrade_prompt_dismissed",
  "checkout_started",
  "checkout_completed",
  "checkout_canceled",
  "subscription_canceled",
  "plan_changed",
  "ai_allowance_reached",
  "premium_feature_requested",
  // Product events (activation and retention).
  "app_opened",
  "path_chosen",
  "circle_created",
  "circle_joined",
  "assessment_skipped",
  "daily_answered",
  "journey_day_completed",
  "journey_finished",
  "today_step_started",
  "weekly_recap_viewed",
  // Journal save flow (event names only, never text).
  "journal_draft_started",
  "journal_draft_autosaved",
  "journal_final_save_clicked",
  "journal_final_save_succeeded",
  "journal_final_save_failed",
  "journal_editor_closed_with_draft",
  "journal_ai_reflection_requested",
  // Berripop's AI follow-up question chosen in the answer flow (context: where).
  "journal_question_selected",
  // Gondolatboncoló (event names only, never text).
  "thought_dissector_opened",
  "thought_dissector_started",
  "thought_dissector_viewpoint_completed",
  "thought_dissector_message_sent",
  "thought_dissector_completed",
  "thought_dissector_abandoned",
  "thought_dissector_saved_to_journal",
  "thought_dissector_quota_exhausted",
  "thought_dissector_premium_clicked",
  // App Store purchases (plan and environment only).
  "apple_purchase_started",
  "apple_purchase_recorded",
  "apple_purchase_failed",
  // Pricing and allowances (plan, interval and a context only; never content).
  "trial_started",
  "trial_completed",
  "feature_paywall_viewed",
  "plan_selected",
  "free_quota_exhausted",
  "ai_cost_cap_reached",
  // Kapcsolati világ (event names and a feature context only; never answers or results).
  "relationship_module_opened",
  "love_language_test_started",
  "love_language_test_completed",
  "attachment_test_started",
  "attachment_test_completed",
  "premium_feature_previewed",
  "premium_paywall_viewed",
  "premium_checkout_started",
  "premium_subscription_completed",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const CONTEXTS = new Set([
  "goals", "ai", "summary", "circles", "pricing", "profile", "journal", "start", "path",
  "personal", "circle", "daily", "journey", "goal", "assessment", "building", "rest", "thought",
  "sandbox", "production", "app", "settings", "converted", "not_converted",
  "google", "apple", "social",
  // Kapcsolati világ features (PREMIUM_FEATURES in lib/relationship/types.ts).
  "relationship", "love_detail", "attachment_detail", "reflection", "trigger", "translator", "growth",
]);
export const isTrackContext = (c: string | undefined) => !!c && CONTEXTS.has(c);

export async function track(userId: string | null, event: FunnelEvent, props: { plan?: string; interval?: string; context?: string } = {}) {
  try {
    await getDb().insert(funnelEvents).values({
      userId,
      event,
      plan: props.plan ?? null,
      interval: props.interval === "month" || props.interval === "year" ? props.interval : null,
      context: props.context && CONTEXTS.has(props.context) ? props.context : null,
    });
  } catch {
    // Analytics must never break the product.
  }
}

/**
 * Called when a member's subscription starts: if they started a checkout from
 * a Kapcsolati világ paywall in the last 7 days, the subscription is credited
 * to that feature (premium_subscription_completed, with the feature as context).
 */
export async function trackRelationshipConversion(userId: string, props: { plan?: string; interval?: string } = {}) {
  try {
    const res = await getDb().execute(sql`
      select context from funnel_events
      where user_id = ${userId} and event = 'premium_checkout_started' and created_at > now() - interval '7 days'
      order by created_at desc limit 1`);
    const context = (res.rows[0] as { context?: unknown } | undefined)?.context;
    if (typeof context === "string") await track(userId, "premium_subscription_completed", { ...props, context });
  } catch {
    // Analytics must never break the product.
  }
}

/** Records the event at most once per member per local day (e.g. app_opened, for retention). */
export async function trackDaily(userId: string, event: FunnelEvent, props: { context?: string } = {}) {
  const context = props.context && CONTEXTS.has(props.context) ? props.context : null;
  try {
    await getDb().execute(sql`
      insert into funnel_events (user_id, event, context)
      select ${userId}, ${event}, ${context}
      where not exists (
        select 1 from funnel_events
        where user_id = ${userId} and event = ${event}
          and (created_at at time zone ${CIRCLE_TIME_ZONE})::date = (now() at time zone ${CIRCLE_TIME_ZONE})::date)`);
  } catch {
    // Analytics must never break the product.
  }
}

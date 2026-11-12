import { isPaidPlan, PLAN_LIMITS, TRIAL_DAYS, type BillingInterval, type PlanId, type PlanLimits, type Tier } from "./plans";

/** The subscription facts we persist from Stripe (App Store subscriptions are mapped to the same shape). */
export type SubscriptionRecord = {
  status: string;
  planId: string;
  interval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type Entitlements = {
  plan: PlanId;
  /** Stripe status, or "none". */
  status: string;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Payment failed but Stripe is still retrying (access kept during the grace period). */
  paymentIssue: boolean;
  /** The subscription ended (canceled, unpaid or expired); the user is back on Free. */
  ended: boolean;
  /** Which limits apply: the plan, or "trial" while a Free member's 4-day trial runs. */
  tier: Tier;
  /** The one-time 4-day trial: not started yet, running (until endsAt), or used. */
  trial: TrialState;
  limits: PlanLimits;
  /** Where the paid plan is bought and managed: the website (Stripe) or the App Store. Null on Free. */
  source: "stripe" | "apple" | null;
};

export type TrialState = { status: "available" | "active" | "used"; endsAt: string | null };

/** The trial grant as stored (entitlement_grants, kind "premium_trial"). */
export type TrialGrant = { startedAt: Date; endsAt: Date };

export const PREMIUM_TRIAL = "premium_trial";

/** When a trial started now would end. */
export const trialEndsAt = (now: Date) => new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

/**
 * Applies the trial: only a member on Free gets the trial limits while it
 * runs. A paying member keeps their plan's limits; billing never changes.
 */
export function withTrial(ent: Entitlements, grant: TrialGrant | null, now: Date): Entitlements {
  const trial: TrialState = !grant ? { status: "available", endsAt: null }
    : { status: grant.endsAt.getTime() > now.getTime() ? "active" : "used", endsAt: grant.endsAt.toISOString() };
  const tier: Tier = trial.status === "active" && ent.plan === "free" ? "trial" : ent.plan;
  return { ...ent, trial, tier, limits: PLAN_LIMITS[tier] };
}

/**
 * The stored paid plan (Premium or Premium Plus) while Stripe reports an active
 * or trialing subscription. "past_due" keeps it during Stripe's automatic
 * retries but flags a payment issue.
 * Everything else (canceled, unpaid, incomplete, incomplete_expired, paused,
 * none) is Free. Never derived from anything the client sends.
 */
const PREMIUM_STATUSES = new Set(["active", "trialing", "past_due"]);
const ENDED_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function entitlementsFrom(sub: SubscriptionRecord | null): Entitlements {
  const status = sub?.status ?? "none";
  const paid = !!sub && isPaidPlan(sub.planId) && PREMIUM_STATUSES.has(status);
  const plan: PlanId = paid && isPaidPlan(sub.planId) ? sub.planId : "free";
  return {
    plan,
    status,
    interval: sub?.interval === "month" || sub?.interval === "year" ? sub.interval : null,
    currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd && paid,
    paymentIssue: status === "past_due",
    ended: ENDED_STATUSES.has(status),
    tier: plan,
    trial: { status: "available", endsAt: null },
    limits: PLAN_LIMITS[plan],
    source: paid ? "stripe" : null,
  };
}

/** A Stripe status that currently grants the paid plan (including the past_due grace period). */
export function isLiveStatus(status: string): boolean {
  return PREMIUM_STATUSES.has(status);
}

/**
 * Whether a subscription read from Stripe may overwrite the stored one. Every
 * event re-reads the subscription, so events about the SAME subscription can
 * arrive in any order and still store its latest state. A DIFFERENT
 * subscription (e.g. an old, ended one after re-subscribing) only replaces the
 * stored one when it is live and the stored one is not, so a late event about
 * an old subscription can never downgrade a current subscriber.
 */
export function shouldApplySubscription(stored: { subscriptionId: string | null; status: string } | null, incoming: { id: string; status: string }): boolean {
  if (!stored?.subscriptionId || stored.subscriptionId === incoming.id) return true;
  return isLiveStatus(incoming.status) && !isLiveStatus(stored.status);
}

export function allowance(used: number, limit: number) {
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, reached: remaining === 0 };
}

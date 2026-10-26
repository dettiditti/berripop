import { isPaidPlan, PLAN_LIMITS, type BillingInterval, type PlanId, type PlanLimits } from "./plans";

/** The subscription facts we persist from Stripe. */
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
  limits: PlanLimits;
};

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
    limits: PLAN_LIMITS[plan],
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

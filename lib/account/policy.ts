import type { Entitlements } from "../billing/entitlements";
import { isPaidPlan } from "../billing/plans";

/**
 * Account deletion rules (pure, unit-tested).
 *
 * A live subscription that would keep renewing must be cancelled first in the
 * Stripe Customer Portal, so deleting an account never leaves a paying
 * subscription behind. One already set to end at the period end is fine: it
 * stops by itself and Stripe keeps the invoices (financial records stay with
 * Stripe, never in our database).
 */
export type DeletionBlock = "active_subscription";

export function deletionBlock(ent: Pick<Entitlements, "plan" | "cancelAtPeriodEnd">): DeletionBlock | null {
  return isPaidPlan(ent.plan) && !ent.cancelAtPeriodEnd ? "active_subscription" : null;
}

/** The member types this word to confirm; both languages are accepted on the server. */
export const DELETE_WORDS = ["TÖRLÉS", "DELETE"] as const;

export function isDeleteConfirmation(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim().toLocaleUpperCase("hu-HU");
  return (DELETE_WORDS as readonly string[]).includes(t);
}

/** The facts about a Stripe subscription that decide whether it will charge again. */
export type LiveSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  /** Stripe's cancel_at (seconds), if a cancellation is scheduled. */
  cancelAt: number | null;
  /** End of the current billing period (seconds), if known. */
  periodEnd: number | null;
};

/** States that will (or, for incomplete, may within about 23 hours) charge again. */
const CHARGING = new Set(["active", "trialing", "past_due", "incomplete"]);

/**
 * Whether a subscription read live from Stripe will renew, so the account
 * must not be deleted yet. A scheduled cancellation only counts when it falls
 * within the current period; with the period unknown it does not count.
 * Canceled, incomplete_expired, unpaid (no more payment attempts) and paused
 * (no invoices until resumed) do not renew.
 */
export function willRenew(sub: LiveSubscription): boolean {
  if (!CHARGING.has(sub.status)) return false;
  if (sub.status === "incomplete") return true;
  if (sub.cancelAtPeriodEnd) return false;
  return !(sub.cancelAt !== null && sub.periodEnd !== null && sub.cancelAt <= sub.periodEnd);
}

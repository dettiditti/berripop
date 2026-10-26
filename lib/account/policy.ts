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

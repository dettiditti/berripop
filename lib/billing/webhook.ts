import type Stripe from "stripe";

/**
 * Pure webhook processing with injected dependencies, so idempotency and
 * routing are unit-testable without Stripe or a database.
 */
export type WebhookDeps = {
  /** Records the event id; resolves false if it was already processed. */
  claim: (eventId: string, type: string) => Promise<boolean>;
  /** Releases a claim after a failure so Stripe's retry is processed. */
  release: (eventId: string) => Promise<void>;
  /** Re-reads the subscription from Stripe and stores it. */
  syncSubscription: (subscriptionId: string) => Promise<void>;
};

export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

type IdOrObject = string | { id: string } | null | undefined;
const idOf = (v: IdOrObject) => (typeof v === "string" ? v : v?.id ?? null);

/** Finds the subscription an event is about, via Stripe's object graph. */
export function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  if (event.type.startsWith("customer.subscription.")) return (obj.id as string) ?? null;
  if (event.type.startsWith("checkout.session.")) {
    return obj.mode === "subscription" ? idOf(obj.subscription as IdOrObject) : null;
  }
  if (event.type.startsWith("invoice.")) {
    // Newer API versions nest it under parent.subscription_details; older ones expose `subscription`.
    const parent = obj.parent as { subscription_details?: { subscription?: IdOrObject } } | undefined;
    return idOf(parent?.subscription_details?.subscription) ?? idOf(obj.subscription as IdOrObject);
  }
  return null;
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

export async function processStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (!HANDLED_EVENTS.has(event.type)) return "ignored";
  if (!(await deps.claim(event.id, event.type))) return "duplicate";
  try {
    const subId = subscriptionIdFromEvent(event);
    if (subId) await deps.syncSubscription(subId);
    return "processed";
  } catch (err) {
    await deps.release(event.id);
    throw err;
  }
}

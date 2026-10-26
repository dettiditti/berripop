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
  /** Whether the configured Stripe key is live; events from the other mode are ignored. */
  livemode: boolean;
  /** The subscription a payment (PaymentIntent) paid an invoice of, if any. */
  subscriptionForPayment: (paymentIntentId: string) => Promise<string | null>;
  /** Cancels the subscription at Stripe right away, then stores it. */
  endSubscription: (subscriptionId: string) => Promise<void>;
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
  "charge.refunded",
  "charge.dispute.closed",
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
  if (event.type.startsWith("invoice.")) return subscriptionIdFromInvoice(obj);
  return null;
}

export function subscriptionIdFromInvoice(invoice: Record<string, unknown>): string | null {
  // Newer API versions nest it under parent.subscription_details; older ones expose `subscription`.
  const parent = invoice.parent as { subscription_details?: { subscription?: IdOrObject } } | undefined;
  return idOf(parent?.subscription_details?.subscription) ?? idOf(invoice.subscription as IdOrObject);
}

/**
 * A payment that was taken back ends Premium: a fully refunded charge, or a
 * dispute the member won (status "lost" for us). Partial refunds, open
 * disputes and disputes we won change nothing. Returns the PaymentIntent.
 */
export function paymentTakenBack(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const taken =
    (event.type === "charge.refunded" && obj.refunded === true) ||
    (event.type === "charge.dispute.closed" && obj.status === "lost");
  return taken ? idOf(obj.payment_intent as IdOrObject) : null;
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

export async function processStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (!HANDLED_EVENTS.has(event.type)) return "ignored";
  if (event.livemode !== deps.livemode) return "ignored";
  if (!(await deps.claim(event.id, event.type))) return "duplicate";
  try {
    if (event.type.startsWith("charge.")) {
      const paymentIntent = paymentTakenBack(event);
      const subId = paymentIntent ? await deps.subscriptionForPayment(paymentIntent) : null;
      if (subId) await deps.endSubscription(subId);
      return "processed";
    }
    const subId = subscriptionIdFromEvent(event);
    if (subId) await deps.syncSubscription(subId);
    return "processed";
  } catch (err) {
    await deps.release(event.id);
    throw err;
  }
}

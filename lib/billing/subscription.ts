import type Stripe from "stripe";

/** The facts we keep from a Stripe subscription, as read from Stripe's API. */
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  lookupKey: string | null;
  interval: string | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Set by us at checkout (subscription_data.metadata); only used when no customer row exists yet. */
  metadataUserId: string | null;
};

export function snapshotFromStripe(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  const price = item?.price;
  // Current API versions keep the billing period on the subscription item.
  const periodEndSec = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status,
    lookupKey: price?.lookup_key ?? null,
    interval: price?.recurring?.interval ?? null,
    periodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
    metadataUserId: sub.metadata?.userId ?? null,
  };
}

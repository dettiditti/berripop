import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { planForLookupKey } from "../lib/billing/plans";
import { shouldApplySubscription } from "../lib/billing/entitlements";
import { snapshotFromStripe } from "../lib/billing/subscription";
import { processStripeEvent, subscriptionIdFromEvent, type WebhookDeps } from "../lib/billing/webhook";

const ev = (type: string, object: Record<string, unknown>, id = "evt_1") => ({ id, type, data: { object } }) as unknown as Stripe.Event;

function deps(seen = new Set<string>()): WebhookDeps & { synced: string[] } {
  const synced: string[] = [];
  return {
    synced,
    claim: async id => (seen.has(id) ? false : (seen.add(id), true)),
    release: async id => { seen.delete(id); },
    syncSubscription: async id => { synced.push(id); },
  };
}

describe("subscription lookup via the object graph", () => {
  it("reads subscription events, checkout sessions and both invoice shapes", () => {
    expect(subscriptionIdFromEvent(ev("customer.subscription.updated", { id: "sub_1" }))).toBe("sub_1");
    expect(subscriptionIdFromEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_2" }))).toBe("sub_2");
    expect(subscriptionIdFromEvent(ev("checkout.session.completed", { mode: "payment", subscription: null }))).toBeNull();
    expect(subscriptionIdFromEvent(ev("invoice.paid", { parent: { subscription_details: { subscription: "sub_3" } } }))).toBe("sub_3");
    expect(subscriptionIdFromEvent(ev("invoice.payment_failed", { subscription: { id: "sub_4" } }))).toBe("sub_4");
  });
});

describe("webhook processing", () => {
  it("syncs the subscription for handled events", async () => {
    const d = deps();
    expect(await processStripeEvent(ev("customer.subscription.updated", { id: "sub_1" }), d)).toBe("processed");
    expect(d.synced).toEqual(["sub_1"]);
  });
  it("is idempotent: a redelivered event is skipped", async () => {
    const d = deps();
    const e = ev("invoice.payment_failed", { subscription: "sub_9" }, "evt_dup");
    expect(await processStripeEvent(e, d)).toBe("processed");
    expect(await processStripeEvent(e, d)).toBe("duplicate");
    expect(d.synced).toEqual(["sub_9"]);
  });
  it("ignores events it doesn't handle", async () => {
    const d = deps();
    expect(await processStripeEvent(ev("customer.created", { id: "cus_1" }), d)).toBe("ignored");
    expect(d.synced).toEqual([]);
  });
  it("releases the claim on failure so Stripe's retry is processed", async () => {
    const seen = new Set<string>();
    const d = deps(seen);
    d.syncSubscription = vi.fn().mockRejectedValueOnce(new Error("Stripe down"));
    const e = ev("customer.subscription.deleted", { id: "sub_5" }, "evt_retry");
    await expect(processStripeEvent(e, d)).rejects.toThrow();
    expect(seen.has("evt_retry")).toBe(false);
  });
});

describe("webhook signature verification", () => {
  // Fake test credentials only; no network calls are made.
  const stripe = new Stripe("sk_test_fake_for_unit_tests");
  const secret = "whsec_test_fake";
  const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });

  it("accepts a correctly signed payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_sig");
  });
  it("rejects a tampered payload or wrong secret", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripe.webhooks.constructEvent(payload.replace("sub_1", "sub_2"), header, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });
});

describe("subscription ordering and mapping", () => {
  it("events about the stored subscription always apply (state is re-read from Stripe)", () => {
    expect(shouldApplySubscription(null, { id: "sub_1", status: "active" })).toBe(true);
    expect(shouldApplySubscription({ subscriptionId: null, status: "none" }, { id: "sub_1", status: "incomplete" })).toBe(true);
    expect(shouldApplySubscription({ subscriptionId: "sub_1", status: "active" }, { id: "sub_1", status: "canceled" })).toBe(true);
    expect(shouldApplySubscription({ subscriptionId: "sub_1", status: "active" }, { id: "sub_1", status: "past_due" })).toBe(true);
  });
  it("a late event about an old, ended subscription never downgrades the current one", () => {
    expect(shouldApplySubscription({ subscriptionId: "sub_new", status: "active" }, { id: "sub_old", status: "canceled" })).toBe(false);
    expect(shouldApplySubscription({ subscriptionId: "sub_new", status: "past_due" }, { id: "sub_old", status: "incomplete_expired" })).toBe(false);
    expect(shouldApplySubscription({ subscriptionId: "sub_new", status: "active" }, { id: "sub_other", status: "active" })).toBe(false);
  });
  it("a new live subscription replaces an ended one (re-subscribing)", () => {
    expect(shouldApplySubscription({ subscriptionId: "sub_old", status: "canceled" }, { id: "sub_new", status: "active" })).toBe(true);
    expect(shouldApplySubscription({ subscriptionId: "sub_old", status: "canceled" }, { id: "sub_new", status: "incomplete" })).toBe(false);
  });
  it("maps a Stripe subscription, reading the period from the subscription item", () => {
    const sub = {
      id: "sub_1", customer: { id: "cus_1" }, status: "active", cancel_at_period_end: false, cancel_at: null, metadata: { userId: "user_1" },
      items: { data: [{ current_period_end: 1800000000, price: { lookup_key: "kozos_premium_monthly_huf", recurring: { interval: "month" } } }] },
    } as unknown as Stripe.Subscription;
    expect(snapshotFromStripe(sub)).toEqual({
      id: "sub_1", customerId: "cus_1", status: "active", lookupKey: "kozos_premium_monthly_huf", interval: "month",
      periodEnd: new Date(1800000000 * 1000), cancelAtPeriodEnd: false, metadataUserId: "user_1",
    });
    const scheduled = { ...sub, customer: "cus_1", cancel_at: 1800000000 } as unknown as Stripe.Subscription;
    expect(snapshotFromStripe(scheduled).cancelAtPeriodEnd).toBe(true);
  });
  it("tells Premium and Premium Plus apart by the subscription's price", () => {
    const withPrice = (lookup_key: string) => ({
      id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, cancel_at: null, metadata: {},
      items: { data: [{ current_period_end: 1800000000, price: { lookup_key, recurring: { interval: "month" } } }] },
    }) as unknown as Stripe.Subscription;
    expect(planForLookupKey(snapshotFromStripe(withPrice("kozos_premium_plus_monthly_huf")).lookupKey)).toBe("premium_plus");
    expect(planForLookupKey(snapshotFromStripe(withPrice("kozos_premium_monthly_huf")).lookupKey)).toBe("premium");
    expect(planForLookupKey(snapshotFromStripe(withPrice("other")).lookupKey)).toBeNull();
  });
});

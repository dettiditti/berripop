import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { planForLookupKey } from "../lib/billing/plans";
import { shouldApplySubscription } from "../lib/billing/entitlements";
import { snapshotFromStripe } from "../lib/billing/subscription";
import { processStripeEvent, subscriptionIdFromEvent, type ReversalEvent, type WebhookDeps } from "../lib/billing/webhook";

const ev = (type: string, object: Record<string, unknown>, id = "evt_1", livemode = false) => ({ id, type, livemode, data: { object } }) as unknown as Stripe.Event;

function deps(seen = new Set<string>()): WebhookDeps & { synced: string[]; ended: string[] } {
  const synced: string[] = [];
  const ended: string[] = [];
  return {
    synced,
    ended,
    claim: async id => (seen.has(id) ? false : (seen.add(id), true)),
    release: async id => { seen.delete(id); },
    syncSubscription: async id => { synced.push(id); },
    livemode: false,
    subscriptionForPayment: async pi => (pi === "pi_sub" ? "sub_paid" : null),
    endSubscription: async id => { ended.push(id); },
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

describe("Stripe mode", () => {
  it("ignores events from the other mode (a test event never touches live data, and vice versa)", async () => {
    const d = deps();
    expect(await processStripeEvent(ev("customer.subscription.updated", { id: "sub_1" }, "evt_live", true), d)).toBe("ignored");
    expect(d.synced).toEqual([]);
    const live = { ...deps(), livemode: true };
    expect(await processStripeEvent(ev("customer.subscription.updated", { id: "sub_1" }, "evt_test", false), live)).toBe("ignored");
    expect(await processStripeEvent(ev("customer.subscription.updated", { id: "sub_1" }, "evt_live", true), live)).toBe("processed");
  });
});

describe("refunds and disputes", () => {
  it("a full refund of a subscription payment ends the subscription", async () => {
    const d = deps();
    expect(await processStripeEvent(ev("charge.refunded", { refunded: true, payment_intent: "pi_sub" }), d)).toBe("processed");
    expect(d.ended).toEqual(["sub_paid"]);
  });
  it("a partial refund, or a payment that paid no subscription, changes nothing", async () => {
    const d = deps();
    await processStripeEvent(ev("charge.refunded", { refunded: false, amount_refunded: 500, payment_intent: "pi_sub" }, "evt_a"), d);
    await processStripeEvent(ev("charge.refunded", { refunded: true, payment_intent: "pi_other" }, "evt_b"), d);
    expect(d.ended).toEqual([]);
    expect(d.synced).toEqual([]);
  });
  it("only a lost dispute ends the subscription", async () => {
    const d = deps();
    await processStripeEvent(ev("charge.dispute.closed", { status: "won", payment_intent: "pi_sub" }, "evt_won"), d);
    expect(d.ended).toEqual([]);
    await processStripeEvent(ev("charge.dispute.closed", { status: "lost", payment_intent: { id: "pi_sub" } }, "evt_lost"), d);
    expect(d.ended).toEqual(["sub_paid"]);
  });
  it("releases the claim when ending fails, so the retry is processed", async () => {
    const seen = new Set<string>();
    const d = deps(seen);
    d.endSubscription = vi.fn().mockRejectedValueOnce(new Error("Stripe down"));
    await expect(processStripeEvent(ev("charge.refunded", { refunded: true, payment_intent: "pi_sub" }, "evt_r"), d)).rejects.toThrow();
    expect(seen.has("evt_r")).toBe(false);
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

describe("invoice jobs from webhook events", () => {
  function invDeps() {
    const d = deps();
    const queued: string[] = [];
    const reversals: ReversalEvent[] = [];
    d.enqueueInvoice = async inv => { queued.push(inv.id as string); };
    d.enqueueReversal = async r => { reversals.push(r); };
    return Object.assign(d, { queued, reversals });
  }
  const paid = (id: string, amount: number, evt: string) => ev("invoice.paid", { id, amount_paid: amount, parent: { subscription_details: { subscription: "sub_1" } } }, evt);

  it("queues one invoice per paid Stripe invoice, renewals included, and ignores redeliveries", async () => {
    const d = invDeps();
    await processStripeEvent(paid("in_1", 299000, "evt_a"), d);
    await processStripeEvent(paid("in_1", 299000, "evt_a"), d);
    await processStripeEvent(paid("in_2", 299000, "evt_b"), d);
    expect(d.queued).toEqual(["in_1", "in_2"]);
  });
  it("queues nothing for zero amounts or failed payments", async () => {
    const d = invDeps();
    await processStripeEvent(paid("in_0", 0, "evt_c"), d);
    await processStripeEvent(ev("invoice.payment_failed", { id: "in_3", amount_paid: 0, subscription: "sub_1" }, "evt_d"), d);
    expect(d.queued).toEqual([]);
    expect(d.synced).toEqual(["sub_1", "sub_1"]);
  });
  it("leaves the subscription active on period-end cancellation (sync only, no invoice action)", async () => {
    const d = invDeps();
    await processStripeEvent(ev("customer.subscription.updated", { id: "sub_1", cancel_at_period_end: true }, "evt_e"), d);
    expect(d.ended).toEqual([]);
    expect(d.queued).toEqual([]);
    expect(d.reversals).toEqual([]);
  });
  it("hands full and partial refunds and lost disputes to the invoice side", async () => {
    const d = invDeps();
    await processStripeEvent(ev("charge.refunded", { id: "ch_1", refunded: true, amount_refunded: 299000, currency: "huf", payment_intent: "pi_sub" }, "evt_f"), d);
    await processStripeEvent(ev("charge.refunded", { id: "ch_2", refunded: false, amount_refunded: 100000, currency: "huf", payment_intent: "pi_x" }, "evt_g"), d);
    await processStripeEvent(ev("charge.dispute.closed", { id: "dp_1", status: "lost", amount: 299000, currency: "huf", payment_intent: "pi_y" }, "evt_h"), d);
    await processStripeEvent(ev("charge.dispute.closed", { id: "dp_2", status: "won", amount: 299000, currency: "huf", payment_intent: "pi_z" }, "evt_i"), d);
    expect(d.reversals.map(r => [r.reversalId, r.plan])).toEqual([
      ["ch_1", { type: "refund", full: true }],
      ["ch_2", { type: "refund", full: false }],
      ["dp_1", { type: "dispute_lost" }],
    ]);
    expect(d.ended).toEqual(["sub_paid"]);
  });
});

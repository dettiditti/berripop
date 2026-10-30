import { beforeEach, describe, expect, it, vi } from "vitest";
import { willRenew, type LiveSubscription } from "../lib/account/policy";

/*
 * Before an account is deleted, Stripe's live state (not our mirror) decides
 * whether a subscription would charge again. willRenew is the pure rule;
 * liveRenewalCheck reads every subscription of the stored customer and says
 * "unknown" whenever Stripe can't answer. Stripe and the database are
 * in-memory stand-ins; nothing reaches Stripe or Neon, and nothing is written.
 */

const PERIOD_END = 1_800_000_000;
const sub = (status: string, patch: Partial<LiveSubscription> = {}): LiveSubscription => ({ status, cancelAtPeriodEnd: false, cancelAt: null, periodEnd: PERIOD_END, ...patch });

describe("willRenew", () => {
  it.each(["active", "trialing", "past_due"])("%s renews unless a cancellation within the period is set", status => {
    expect(willRenew(sub(status))).toBe(true);
    expect(willRenew(sub(status, { cancelAtPeriodEnd: true }))).toBe(false);
    expect(willRenew(sub(status, { cancelAt: PERIOD_END }))).toBe(false);
    expect(willRenew(sub(status, { cancelAt: PERIOD_END - 86_400 }))).toBe(false);
  });

  it("a cancellation scheduled after the current period still lets it renew in between", () => {
    expect(willRenew(sub("active", { cancelAt: PERIOD_END + 30 * 86_400 }))).toBe(true);
  });

  it("with the period unknown, a scheduled cancellation does not count", () => {
    expect(willRenew(sub("active", { cancelAt: PERIOD_END, periodEnd: null }))).toBe(true);
  });

  it("incomplete may still be paid within about 23 hours, whatever is scheduled", () => {
    expect(willRenew(sub("incomplete"))).toBe(true);
    expect(willRenew(sub("incomplete", { cancelAtPeriodEnd: true }))).toBe(true);
  });

  it.each(["canceled", "incomplete_expired", "unpaid", "paused", "something_new"])("%s does not renew", status => {
    expect(willRenew(sub(status))).toBe(false);
  });
});

// The stored customer per member.
const customers: Record<string, string> = { user_a: "cus_a" };
let stripeConfigured = true;
let failWith: unknown = null;
// Subscriptions Stripe holds per customer, in the order its list returns them (several pages).
const stripeSubs: Record<string, Record<string, unknown>[]> = {};
const listCalls: { params: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
const writes: string[] = [];

const stripeSub = (id: string, status: string, patch: Record<string, unknown> = {}) => ({
  id, status, customer: "cus_a", cancel_at_period_end: false, cancel_at: null, metadata: {},
  items: { data: [{ current_period_end: PERIOD_END, price: { lookup_key: "kozos_premium_monthly_huf", recurring: { interval: "month" } } }] },
  ...patch,
});

vi.mock("server-only", () => ({}));
vi.mock("../lib/billing/stripe", () => ({
  isTestMode: () => false,
  getStripe: () => (stripeConfigured ? {
    subscriptions: {
      list: (params: Record<string, unknown>, opts: Record<string, unknown>) => {
        listCalls.push({ params, opts });
        return (async function* () {
          if (failWith) throw failWith;
          for (const s of stripeSubs[params.customer as string] ?? []) yield s;
        })();
      },
      update: () => void writes.push("update"),
      cancel: () => void writes.push("cancel"),
    },
  } : null),
}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (lookupUser && customers[lookupUser] ? [{ customerId: customers[lookupUser] }] : []) }) }) }),
  }),
}));
let lookupUser = "";
vi.mock("../lib/server/analytics", () => ({ track: async () => {} }));
vi.mock("../lib/server/invoicing", () => ({ enqueueInvoice: async () => {}, enqueueReversal: async () => {} }));
vi.mock("../lib/server/legal", () => ({ recordCheckoutDisclosure: async () => {} }));
vi.mock("../lib/server/entitlements", () => ({ getUserEntitlements: async () => ({}) }));

const { liveRenewalCheck } = await import("../lib/server/billing");
const check = (userId: string) => ((lookupUser = userId), liveRenewalCheck(userId));

beforeEach(() => {
  stripeConfigured = true;
  failWith = null;
  listCalls.length = writes.length = 0;
  for (const k of Object.keys(stripeSubs)) delete stripeSubs[k];
});

describe("liveRenewalCheck", () => {
  it("no stored customer: nothing to check, Stripe is not asked", async () => {
    expect(await check("user_without_checkout")).toBe("clear");
    expect(listCalls).toEqual([]);
  });

  it("asks Stripe for every subscription of the stored customer, with a short timeout", async () => {
    await check("user_a");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].params).toMatchObject({ customer: "cus_a", status: "all" });
    expect(listCalls[0].opts).toMatchObject({ timeout: 8_000, maxNetworkRetries: 1 });
  });

  it("renewing when any subscription will charge again, even behind ended ones", async () => {
    stripeSubs.cus_a = [stripeSub("sub_old", "canceled"), stripeSub("sub_x", "incomplete_expired"), stripeSub("sub_live", "active")];
    expect(await check("user_a")).toBe("renewing");
  });

  it("a second, forgotten subscription is found even when the first is set to end", async () => {
    stripeSubs.cus_a = [stripeSub("sub_1", "active", { cancel_at_period_end: true }), stripeSub("sub_2", "active")];
    expect(await check("user_a")).toBe("renewing");
  });

  it("clear when every subscription has ended or is set to end", async () => {
    stripeSubs.cus_a = [stripeSub("sub_1", "active", { cancel_at_period_end: true }), stripeSub("sub_2", "canceled"), stripeSub("sub_3", "past_due", { cancel_at: PERIOD_END })];
    expect(await check("user_a")).toBe("clear");
  });

  it("clear when the customer has no subscriptions at all", async () => {
    expect(await check("user_a")).toBe("clear");
  });

  it.each([
    ["Stripe not configured", () => { stripeConfigured = false; }],
    ["a timeout", () => { failWith = Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" }); }],
    ["a customer this key can't see (e.g. live customer, test key)", () => { failWith = Object.assign(new Error("No such customer"), { code: "resource_missing" }); }],
    ["any other error", () => { failWith = new Error("boom"); }],
  ])("unknown for %s, never clear", async (_, setup) => {
    setup();
    expect(await check("user_a")).toBe("unknown");
  });

  it("an error after the first page is still unknown, not a partial answer", async () => {
    stripeSubs.cus_a = [stripeSub("sub_1", "canceled")];
    const real = stripeSubs.cus_a;
    failWith = null;
    // First item fine, then the next page fails.
    stripeSubs.cus_a = new Proxy(real, {
      get(t, k) {
        if (k === Symbol.iterator) return function* () { yield real[0]; throw new Error("page 2 failed"); };
        return Reflect.get(t, k);
      },
    });
    expect(await check("user_a")).toBe("unknown");
  });

  it("only reads: never updates or cancels anything", async () => {
    stripeSubs.cus_a = [stripeSub("sub_live", "active")];
    await check("user_a");
    expect(writes).toEqual([]);
  });
});

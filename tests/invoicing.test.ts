import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoices, legalRecords } from "../lib/db/schema";
import { planReversal } from "../lib/invoicing/jobs";

/*
 * Manual invoicing follow-up, against an in-memory stand-in for the
 * database: no request reaches Stripe, an invoicing provider or Neon.
 */

/** Rows keyed by operation_key, like the unique index; a conflicting insert does nothing. */
const store = new Map<string, Record<string, unknown>>();
vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          if (!store.has(v.operationKey as string)) store.set(v.operationKey as string, v);
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  }),
}));

const { enqueueInvoice, enqueueReversal } = await import("../lib/server/invoicing");

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe("manual invoicing follow-up", () => {
  it("records one open task per paid Stripe invoice, with identifiers and amount only", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await enqueueInvoice({ id: "in_1", amount_paid: 299000, currency: "HUF", customer: "cus_1", customer_name: "Teszt Elek", customer_address: { city: "Budapest" } }, "sub_1");
    expect([...store.values()]).toEqual([{
      operationKey: "invoice:in_1", kind: "invoice", userId: null, stripeCustomerId: "cus_1", stripeInvoiceId: "in_1", stripeSubscriptionId: "sub_1",
      amount: 299000, currency: "huf", providerExternalId: "bp-in_1", status: "manual",
    }]);
    expect(JSON.stringify([...store.values()])).not.toMatch(/Teszt|Budapest/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not create a second task when the same invoice arrives again", async () => {
    await enqueueInvoice({ id: "in_1", amount_paid: 299000, currency: "huf" }, "sub_1");
    await enqueueInvoice({ id: "in_1", amount_paid: 299000, currency: "huf" }, "sub_1");
    await enqueueInvoice({ id: "in_2", amount_paid: 299000, currency: "huf" }, "sub_1");
    expect([...store.keys()]).toEqual(["invoice:in_1", "invoice:in_2"]);
  });

  it("records nothing for zero-amount invoices", async () => {
    await enqueueInvoice({ id: "in_0", amount_paid: 0, currency: "huf" }, "sub_1");
    expect(store.size).toBe(0);
  });

  it("records refunds and lost disputes as open tasks; nothing is issued automatically", async () => {
    await enqueueReversal({ eventId: "evt_1", paymentIntentId: "pi_1", reversalId: "ch_1", amount: 299000, currency: "huf", plan: { type: "refund", full: true } }, "in_1");
    await enqueueReversal({ eventId: "evt_1", paymentIntentId: "pi_1", reversalId: "ch_1", amount: 299000, currency: "huf", plan: { type: "refund", full: true } }, "in_1");
    await enqueueReversal({ eventId: "evt_2", paymentIntentId: "pi_2", reversalId: "dp_1", amount: 299000, currency: "huf", plan: { type: "dispute_lost" } }, null);
    expect([...store.values()].map(r => [r.operationKey, r.kind, r.status, r.lastError])).toEqual([
      ["reversal:evt_1", "storno", "manual", "full_refund:original_task_not_found"],
      ["reversal:evt_2", "correction", "manual", "dispute_lost:original_task_not_found"],
    ]);
  });

  it("names the document a reversal needs", () => {
    expect(planReversal({ type: "refund", full: true })).toEqual({ kind: "storno", reason: "full_refund" });
    expect(planReversal({ type: "refund", full: false })).toEqual({ kind: "correction", reason: "partial_refund" });
    expect(planReversal({ type: "dispute_lost" })).toEqual({ kind: "correction", reason: "dispute_lost" });
  });
});

describe("records kept after account deletion", () => {
  it("keeps invoice tasks (link set to null) and deletes legal records with the account", () => {
    expect(getTableConfig(invoices).foreignKeys.map(f => f.onDelete)).toEqual(["set null"]);
    expect(getTableConfig(legalRecords).foreignKeys[0].onDelete).toBe("cascade");
  });
});

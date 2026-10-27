/**
 * Manual invoicing follow-up (lib/server/invoicing.ts stores it): every paid
 * Stripe invoice, refund and lost dispute becomes one task in `invoices` for
 * the operator. Nothing is issued automatically, and no invoicing provider is
 * called; the operator issues the document by hand and records its number.
 *
 * Task statuses:
 *   manual   open: the operator still has to issue the invoice (or storno / correction)
 *   issued   done: the operator recorded the number of the document they issued
 */
export type InvoiceStatus = "manual" | "issued";

/** Which document a reversal needs; the operator decides and issues it by hand. */
export type ReversalPlan = { kind: "storno"; reason: "full_refund" } | { kind: "correction"; reason: "partial_refund" | "dispute_lost" };

export function planReversal(event: { type: "refund"; full: boolean } | { type: "dispute_lost" }): ReversalPlan {
  if (event.type === "dispute_lost") return { kind: "correction", reason: "dispute_lost" };
  return event.full ? { kind: "storno", reason: "full_refund" } : { kind: "correction", reason: "partial_refund" };
}

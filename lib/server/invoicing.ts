import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { invoices, subscriptions } from "../db/schema";
import { planReversal } from "../invoicing/jobs";
import type { ReversalEvent } from "../billing/webhook";

/*
 * Manual invoicing follow-up. The webhook records one task per Stripe
 * operation in `invoices` (unique operation_key, so redelivered events never
 * add a second one); the operator issues the invoice by hand and records its
 * number (scripts/invoices.ts). No invoicing provider is called and nothing
 * is issued automatically. Only identifiers, amount and status are stored,
 * never buyer data or invoice contents (those stay at Stripe and in the
 * invoicing software).
 */

async function userForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const [row] = await getDb().select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
  return row?.userId ?? null;
}

type IdOrObject = string | { id: string } | null | undefined;
const idOf = (v: IdOrObject) => (typeof v === "string" ? v : v?.id ?? null);

/** invoice.paid with money taken: one follow-up task per Stripe invoice (idempotent). */
export async function enqueueInvoice(inv: Record<string, unknown>, subscriptionId: string | null): Promise<void> {
  const id = inv.id as string;
  const amount = Number(inv.amount_paid ?? 0);
  if (!id || amount <= 0) return;
  const customerId = idOf(inv.customer as IdOrObject);
  await getDb()
    .insert(invoices)
    .values({
      operationKey: `invoice:${id}`,
      kind: "invoice",
      userId: await userForCustomer(customerId),
      stripeCustomerId: customerId,
      stripeInvoiceId: id,
      stripeSubscriptionId: subscriptionId,
      amount,
      currency: String(inv.currency ?? "").toLowerCase(),
      providerExternalId: `bp-${id}`,
      status: "manual",
    })
    .onConflictDoNothing();
}

/** A refund or lost dispute: a follow-up task for a storno or correction, issued by hand. */
export async function enqueueReversal(r: ReversalEvent, stripeInvoiceId: string | null): Promise<void> {
  const db = getDb();
  const [original] = stripeInvoiceId
    ? await db.select().from(invoices).where(and(eq(invoices.stripeInvoiceId, stripeInvoiceId), eq(invoices.kind, "invoice"))).limit(1)
    : [];
  const plan = planReversal(r.plan);
  await db
    .insert(invoices)
    .values({
      operationKey: `reversal:${r.eventId}`,
      kind: plan.kind,
      userId: original?.userId ?? null,
      stripeCustomerId: original?.stripeCustomerId ?? null,
      stripeInvoiceId,
      stripeSubscriptionId: original?.stripeSubscriptionId ?? null,
      stripePaymentIntentId: r.paymentIntentId,
      stripeReversalId: r.reversalId,
      amount: r.amount,
      currency: r.currency,
      originalInvoiceId: original?.id ?? null,
      providerExternalId: `bp-rev-${r.eventId}`,
      status: "manual",
      lastError: original ? plan.reason : `${plan.reason}:original_task_not_found`,
    })
    .onConflictDoNothing();
}

/* ---------- Operator tools (scripts/invoices.ts) ---------- */

export async function listInvoiceJobs(status?: string) {
  const db = getDb();
  const q = db
    .select({ id: invoices.id, kind: invoices.kind, status: invoices.status, note: invoices.lastError, amount: invoices.amount, currency: invoices.currency, stripeInvoiceId: invoices.stripeInvoiceId, number: invoices.providerInvoiceNumber, createdAt: invoices.createdAt })
    .from(invoices);
  return (status ? q.where(eq(invoices.status, status)) : q).orderBy(desc(invoices.createdAt)).limit(100);
}

/** Records the number of the document the operator issued by hand. */
export async function markInvoiceIssuedManually(id: string, invoiceNumber: string, vatKey: string | null): Promise<boolean> {
  const res = await getDb()
    .update(invoices)
    .set({ status: "issued", providerInvoiceNumber: invoiceNumber, vatKey, issuedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.status, "manual")))
    .returning({ id: invoices.id });
  return res.length > 0;
}

/** The member's invoices for the data export. */
export async function invoicesForUser(userId: string) {
  return getDb()
    .select({ kind: invoices.kind, status: invoices.status, amount: invoices.amount, currency: invoices.currency, invoiceNumber: invoices.providerInvoiceNumber, issuedAt: invoices.issuedAt, createdAt: invoices.createdAt })
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .orderBy(desc(invoices.createdAt));
}

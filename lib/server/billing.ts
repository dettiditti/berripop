import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { stripeEvents, subscriptions, users } from "../db/schema";
import { entitlementsFrom, shouldApplySubscription, type Entitlements } from "../billing/entitlements";
import { isPaidPlan, planForLookupKey, priceFor, type BillingInterval, type PaidPlanId } from "../billing/plans";
import { getStripe, isTestMode } from "../billing/stripe";
import { snapshotFromStripe, type SubscriptionSnapshot } from "../billing/subscription";
import { processStripeEvent, subscriptionIdFromInvoice } from "../billing/webhook";
import { track } from "./analytics";
import { getUserEntitlements } from "./entitlements";

/*
 * Billing service. Subscription state is only ever written from data read
 * from Stripe's API on the server, never from a client value or a success URL.
 */

export type BillingError = "billing_unavailable" | "already_premium" | "no_customer" | "not_found" | "invalid" | "not_subscribed" | "plan_change_unavailable";

async function ensureCustomer(stripe: Stripe, userId: string, email?: string | null): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (row) return row.stripeCustomerId;
  const [user] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  const customer = await stripe.customers.create({ email: email ?? undefined, name: user?.name || undefined, metadata: { userId } });
  await db.insert(subscriptions).values({ userId, stripeCustomerId: customer.id }).onConflictDoNothing();
  const [after] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return after.stripeCustomerId;
}

async function findPriceId(stripe: Stripe, plan: PaidPlanId, interval: BillingInterval): Promise<string | null> {
  const cfg = priceFor(plan, interval);
  if (!cfg) return null;
  const list = await stripe.prices.list({ lookup_keys: [cfg.lookupKey], active: true, limit: 1 });
  return list.data[0]?.id ?? null;
}

/**
 * New subscriptions only (Free → Premium or Premium Plus). A member who already
 * pays switches plans in the Customer Portal (createPlanChangeSession), so a
 * second, parallel subscription is never created.
 */
export async function createCheckoutSession(
  userId: string,
  plan: PaidPlanId,
  interval: BillingInterval,
  origin: string,
  opts: { email?: string | null; locale?: "hu" | "en" } = {},
): Promise<{ ok: true; url: string } | { ok: false; error: BillingError }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "billing_unavailable" };
  const ent = await getUserEntitlements(userId);
  if (!priceFor(plan, interval)) return { ok: false, error: "invalid" };
  if (isPaidPlan(ent.plan)) return { ok: false, error: "already_premium" };
  const priceId = await findPriceId(stripe, plan, interval);
  if (!priceId) return { ok: false, error: "billing_unavailable" };
  const customer = await ensureCustomer(stripe, userId, opts.email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId } },
    locale: opts.locale ?? "hu",
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing/canceled`,
  });
  await track(userId, "checkout_started", { plan, interval });
  if (!session.url) return { ok: false, error: "billing_unavailable" };
  return { ok: true, url: session.url };
}

/** Reads a subscription from Stripe and stores the authoritative state. */
export async function syncSubscriptionFromStripe(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  await storeSubscriptionSnapshot(snapshotFromStripe(await stripe.subscriptions.retrieve(subscriptionId)));
}

/**
 * Stores a subscription snapshot for the user who owns the Stripe customer.
 * Returns false when it was not applied (unknown customer, or an older
 * subscription that must not replace the current one).
 */
export async function storeSubscriptionSnapshot(snap: SubscriptionSnapshot): Promise<boolean> {
  const db = getDb();

  // Map Stripe → our user through the stored customer id; metadata is only a fallback.
  let [row] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, snap.customerId)).limit(1);
  if (!row && snap.metadataUserId) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, snap.metadataUserId)).limit(1);
    if (u) {
      await db.insert(subscriptions).values({ userId: u.id, stripeCustomerId: snap.customerId }).onConflictDoNothing();
      [row] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, snap.customerId)).limit(1);
    }
  }
  if (!row) return false;
  if (!shouldApplySubscription({ subscriptionId: row.stripeSubscriptionId, status: row.status }, { id: snap.id, status: snap.status })) return false;

  const before = entitlementsFrom(row);
  await db
    .update(subscriptions)
    .set({
      stripeSubscriptionId: snap.id,
      // The plan comes only from the price Stripe reports; unknown prices grant nothing.
      planId: planForLookupKey(snap.lookupKey) ?? "free",
      status: snap.status,
      interval: snap.interval,
      currentPeriodEnd: snap.periodEnd,
      cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, row.userId));
  const after = await getUserEntitlements(row.userId);

  if (before.plan === "free" && isPaidPlan(after.plan)) await track(row.userId, "checkout_completed", { plan: after.plan, interval: after.interval ?? undefined });
  if (isPaidPlan(before.plan) && isPaidPlan(after.plan) && before.plan !== after.plan) await track(row.userId, "plan_changed", { plan: after.plan, interval: after.interval ?? undefined });
  if ((!before.cancelAtPeriodEnd && after.cancelAtPeriodEnd) || (isPaidPlan(before.plan) && after.ended)) {
    await track(row.userId, "subscription_canceled", { plan: before.plan, interval: before.interval ?? undefined });
  }
  return true;
}

/**
 * Called from the success page. Verifies with Stripe that the session belongs
 * to this user and completed, then syncs. The URL alone proves nothing.
 */
export async function confirmCheckout(userId: string, sessionId: string): Promise<{ state: "active" | "pending" | "invalid"; entitlements: Entitlements }> {
  const stripe = getStripe();
  if (!stripe || !/^cs_/.test(sessionId)) return { state: "invalid", entitlements: await getUserEntitlements(userId) };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return { state: "invalid", entitlements: await getUserEntitlements(userId) };
  }
  if (session.client_reference_id !== userId) return { state: "invalid", entitlements: await getUserEntitlements(userId) };
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (session.status === "complete" && subId) await syncSubscriptionFromStripe(subId);
  const entitlements = await getUserEntitlements(userId);
  return { state: isPaidPlan(entitlements.plan) ? "active" : "pending", entitlements };
}

async function portalConfigurationId(stripe: Stripe): Promise<string | undefined> {
  const existing = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (existing.data[0]) return undefined; // the default one is used automatically
  const any = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
  return any.data[0]?.id;
}

export async function createPortalSession(userId: string, origin: string, locale: "hu" | "en" = "hu"): Promise<{ ok: true; url: string } | { ok: false; error: BillingError }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "billing_unavailable" };
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row) return { ok: false, error: "no_customer" };
  const configuration = await portalConfigurationId(stripe);
  const session = await stripe.billingPortal.sessions.create({ customer: row.stripeCustomerId, return_url: `${origin}/settings#subscription`, locale, ...(configuration ? { configuration } : {}) });
  return { ok: true, url: session.url };
}

/**
 * Switching between Premium and Premium Plus for a member who already pays:
 * opens the Customer Portal straight on the confirmation of the new price
 * (Stripe shows the prorated amount before anything is charged). The plan
 * itself changes only when Stripe's subscription webhook arrives.
 */
export async function createPlanChangeSession(userId: string, target: PaidPlanId, origin: string, locale: "hu" | "en" = "hu"): Promise<{ ok: true; url: string } | { ok: false; error: BillingError }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "billing_unavailable" };
  const ent = await getUserEntitlements(userId);
  if (!isPaidPlan(ent.plan)) return { ok: false, error: "not_subscribed" };
  if (ent.plan === target) return { ok: false, error: "invalid" };
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row?.stripeSubscriptionId) return { ok: false, error: "not_subscribed" };
  // Premium Plus is sold monthly; switching back to Premium keeps the monthly rhythm.
  const priceId = await findPriceId(stripe, target, "month");
  if (!priceId) return { ok: false, error: "billing_unavailable" };
  try {
    const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) return { ok: false, error: "not_subscribed" };
    const returnUrl = `${origin}/settings#subscription`;
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: returnUrl,
      locale,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: { subscription: sub.id, items: [{ id: item.id, price: priceId, quantity: 1 }] },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
      },
    });
    return { ok: true, url: session.url };
  } catch {
    // E.g. the portal configuration doesn't list this price yet: the member can still use the regular portal.
    return { ok: false, error: "plan_change_unavailable" };
  }
}

/**
 * Turns off renewal of the member's subscription (it still ends at the period
 * end, as when they cancel in the portal). Used when the login was deleted
 * outside the app, so a deleted account never keeps being charged.
 */
export async function stopRenewal(userId: string): Promise<void> {
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row?.stripeSubscriptionId) return;
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  try {
    await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true });
  } catch (err) {
    // Already gone at Stripe (or from another mode): nothing left to renew.
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }
}

/** Verifies the signature, then processes the event idempotently. */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: string }> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return { status: 503, body: "Stripe webhook not configured" };
  if (!signature) return { status: 400, body: "Missing signature" };
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { status: 400, body: "Invalid signature" };
  }
  const db = getDb();
  try {
    const outcome = await processStripeEvent(event, {
      claim: async (id, type) => (await db.insert(stripeEvents).values({ id, type }).onConflictDoNothing().returning({ id: stripeEvents.id })).length > 0,
      release: async id => { await db.delete(stripeEvents).where(eq(stripeEvents.id, id)); },
      syncSubscription: syncSubscriptionFromStripe,
      livemode: !isTestMode(),
      subscriptionForPayment: async paymentIntent => {
        const list = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentIntent }, limit: 1, expand: ["data.invoice"] });
        const invoice = list.data[0]?.invoice;
        return invoice && typeof invoice !== "string" ? subscriptionIdFromInvoice(invoice as unknown as Record<string, unknown>) : null;
      },
      endSubscription: async subscriptionId => {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (sub.status !== "canceled" && sub.status !== "incomplete_expired") await stripe.subscriptions.cancel(subscriptionId);
        await syncSubscriptionFromStripe(subscriptionId);
      },
    });
    return { status: 200, body: outcome };
  } catch {
    return { status: 500, body: "Processing failed" };
  }
}

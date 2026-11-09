import { entitlementsFrom, withTrial, type Entitlements, type SubscriptionRecord, type TrialGrant } from "./entitlements";
import { isPaidPlan, type BillingInterval, type PaidPlanId } from "./plans";

/*
 * App Store (in-app purchase) rules, without the database or Apple's network.
 * The server verifies Apple's signature first (lib/server/apple.ts); these
 * functions only interpret data that is already trusted.
 */

export const APPLE_BUNDLE_ID = "com.berripop.app";

/** The four auto-renewable subscriptions, in one subscription group in App Store Connect. */
export const APPLE_PRODUCTS = {
  "com.berripop.premium.monthly": { plan: "premium", interval: "month" },
  "com.berripop.premium.annual": { plan: "premium", interval: "year" },
  "com.berripop.plus.monthly": { plan: "premium_plus", interval: "month" },
  "com.berripop.plus.annual": { plan: "premium_plus", interval: "year" },
} as const satisfies Record<string, { plan: PaidPlanId; interval: BillingInterval }>;

export type AppleProductId = keyof typeof APPLE_PRODUCTS;
export const APPLE_PRODUCT_IDS = Object.keys(APPLE_PRODUCTS) as AppleProductId[];
export const isAppleProduct = (id: unknown): id is AppleProductId => typeof id === "string" && Object.hasOwn(APPLE_PRODUCTS, id);

export type AppleStatus = "active" | "grace" | "billing_retry" | "expired" | "revoked";

export type AppleState = { status: AppleStatus; expiresAt: Date | null; autoRenew: boolean };

/** The parts of Apple's signed transaction and renewal info we use (times in milliseconds). */
export type AppleTx = { expiresDate?: number; revocationDate?: number };
export type AppleRenewal = { autoRenewStatus?: number; gracePeriodExpiresDate?: number; isInBillingRetryPeriod?: boolean };

/**
 * The subscription's state from Apple's latest transaction and, when known,
 * renewal info. In the billing grace period access continues until the grace
 * period ends; in the billing retry period (after it) access stops.
 */
export function appleStateFrom(tx: AppleTx, renewal: AppleRenewal | null, now: Date, previousAutoRenew = true): AppleState {
  const autoRenew = renewal?.autoRenewStatus === undefined ? previousAutoRenew : renewal.autoRenewStatus === 1;
  const expires = tx.expiresDate ? new Date(tx.expiresDate) : null;
  if (tx.revocationDate) return { status: "revoked", expiresAt: expires, autoRenew: false };
  if (expires && expires > now) return { status: "active", expiresAt: expires, autoRenew };
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now.getTime()) {
    return { status: "grace", expiresAt: new Date(renewal.gracePeriodExpiresDate), autoRenew };
  }
  if (renewal?.isInBillingRetryPeriod) return { status: "billing_retry", expiresAt: expires, autoRenew };
  return { status: "expired", expiresAt: expires, autoRenew };
}

/**
 * A renewal notification can arrive a little after the period ends. Access
 * stays this long past the stored expiry, so a slow notification never cuts
 * a paying member off; a missed renewal still ends access soon after.
 */
export const APPLE_EXPIRY_LEEWAY_MS = 24 * 60 * 60 * 1000;

export type AppleRow = { planId: string; interval: string | null; status: string; expiresAt: Date | null; autoRenew: boolean };

/** An App Store subscription in the same shape as a stored Stripe one, so one rule decides access. */
export function appleRecord(row: AppleRow, now: Date): SubscriptionRecord {
  const live = (row.status === "active" || row.status === "grace") && (!row.expiresAt || row.expiresAt.getTime() + APPLE_EXPIRY_LEEWAY_MS > now.getTime());
  return {
    planId: row.planId,
    interval: row.interval,
    status: !live ? "canceled" : row.status === "grace" ? "past_due" : "active",
    currentPeriodEnd: row.expiresAt,
    cancelAtPeriodEnd: !row.autoRenew,
  };
}

const RANK: Record<string, number> = { free: 0, premium: 1, premium_plus: 2 };

/**
 * One member's access from both stores. The higher paid plan wins; with the
 * same plan on both, the Stripe one is shown (it carries billing management).
 * `source` says where the paid plan comes from (null on Free).
 */
export function combinedEntitlements(stripe: SubscriptionRecord | null, apple: AppleRow[], now: Date, trial: TrialGrant | null = null): Entitlements {
  return withTrial(paidEntitlements(stripe, apple, now), trial, now);
}

function paidEntitlements(stripe: SubscriptionRecord | null, apple: AppleRow[], now: Date): Entitlements {
  const fromStripe = entitlementsFrom(stripe);
  const best = apple
    .map(row => entitlementsFrom(appleRecord(row, now)))
    .filter(e => isPaidPlan(e.plan))
    .sort((a, b) => RANK[b.plan] - RANK[a.plan] || (b.currentPeriodEnd ?? "").localeCompare(a.currentPeriodEnd ?? ""))[0];
  if (best && RANK[best.plan] > RANK[fromStripe.plan]) return { ...best, source: "apple" };
  return { ...fromStripe, source: isPaidPlan(fromStripe.plan) ? "stripe" : null };
}

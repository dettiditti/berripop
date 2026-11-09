import "server-only";
import { and, eq, lte, or, isNull } from "drizzle-orm";
import { Environment, SignedDataVerifier, type JWSRenewalInfoDecodedPayload, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { getDb } from "../db";
import { appleNotifications, appleSubscriptions } from "../db/schema";
import { APPLE_BUNDLE_ID, APPLE_PRODUCTS, appleStateFrom, isAppleProduct } from "../billing/apple";
import { appAccountToken } from "../billing/apple-token";
import { APPLE_ROOT_CA_G3 } from "../billing/apple-root";
import { track } from "./analytics";

/*
 * App Store purchases on the server. Nothing from the app is trusted as is:
 * every transaction and notification must carry Apple's signature (checked
 * against Apple's root certificate), our bundle id, a known product and, for
 * purchases, the signed-in account's token. Only then is a row written.
 *
 * Settings (Vercel): APPLE_APP_ID, the app's numeric Apple ID from App Store
 * Connect (needed to verify production data). Sandbox data (TestFlight, App
 * Review, sandbox testers) is accepted too and stored with environment
 * "Sandbox". Xcode's local StoreKit testing is unsigned: it is accepted only
 * outside production with APPLE_ALLOW_XCODE=1, and never written.
 */

export type AppleError = "unavailable" | "invalid" | "wrong_account" | "unknown_product";
export type AppleResult = { ok: true; stored: boolean; plan: string } | { ok: false; error: AppleError };

const ROOTS = [Buffer.from(APPLE_ROOT_CA_G3, "base64")];

function appAppleId(): number | undefined {
  const n = Number(process.env.APPLE_APP_ID);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const xcodeAllowed = () => process.env.APPLE_ALLOW_XCODE === "1" && process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production";

/** The verifier for the environment a payload claims; the library then checks that claim against the signature. */
function verifierFor(environment: unknown): SignedDataVerifier | null {
  if (environment === Environment.PRODUCTION) {
    const id = appAppleId();
    return id ? new SignedDataVerifier(ROOTS, true, Environment.PRODUCTION, APPLE_BUNDLE_ID, id) : null;
  }
  if (environment === Environment.SANDBOX) return new SignedDataVerifier(ROOTS, true, Environment.SANDBOX, APPLE_BUNDLE_ID);
  if (environment === Environment.XCODE && xcodeAllowed()) return new SignedDataVerifier(ROOTS, false, Environment.XCODE, APPLE_BUNDLE_ID);
  return null;
}

/** Reads the (not yet verified) environment claim of a signed payload, to pick the verifier. */
function claimedEnvironment(jws: string): unknown {
  try {
    const part = jws.split(".")[1];
    const body = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { environment?: unknown; data?: { environment?: unknown } };
    return body.environment ?? body.data?.environment;
  } catch {
    return null;
  }
}

async function verifyTransaction(jws: string): Promise<{ tx: JWSTransactionDecodedPayload; verifier: SignedDataVerifier; env: string } | null> {
  if (typeof jws !== "string" || jws.length > 20_000) return null;
  const env = claimedEnvironment(jws);
  const verifier = verifierFor(env);
  if (!verifier) return null;
  try {
    return { tx: await verifier.verifyAndDecodeTransaction(jws), verifier, env: String(env) };
  } catch {
    return null;
  }
}

type Apply = { userId: string; tx: JWSTransactionDecodedPayload; renewal: JWSRenewalInfoDecodedPayload | null; env: string };

/**
 * Writes one subscription's latest state. A row older than the stored one
 * (by Apple's signedDate) never overwrites it, so notifications may arrive
 * in any order. A subscription already tied to another account is left alone.
 */
async function applyState({ userId, tx, renewal, env }: Apply): Promise<"stored" | "stale" | "other_account"> {
  const product = APPLE_PRODUCTS[tx.productId as keyof typeof APPLE_PRODUCTS];
  const original = tx.originalTransactionId!;
  const signedAt = new Date(Math.max(tx.signedDate ?? 0, renewal?.signedDate ?? 0) || Date.now());
  const db = getDb();
  const [existing] = await db.select().from(appleSubscriptions).where(eq(appleSubscriptions.originalTransactionId, original)).limit(1);
  if (existing && existing.userId !== userId) return "other_account";
  const state = appleStateFrom(tx, renewal, new Date(), existing?.autoRenew ?? true);
  const values = {
    productId: tx.productId!, planId: product.plan, interval: product.interval,
    status: state.status, expiresAt: state.expiresAt, autoRenew: state.autoRenew,
    environment: env, signedAt, updatedAt: new Date(),
  };
  if (!existing) {
    const inserted = await db.insert(appleSubscriptions).values({ originalTransactionId: original, userId, ...values }).onConflictDoNothing().returning({ id: appleSubscriptions.originalTransactionId });
    if (inserted.length) return "stored";
  }
  const updated = await db.update(appleSubscriptions).set(values)
    .where(and(eq(appleSubscriptions.originalTransactionId, original), eq(appleSubscriptions.userId, userId), or(isNull(appleSubscriptions.signedAt), lte(appleSubscriptions.signedAt, signedAt))))
    .returning({ id: appleSubscriptions.originalTransactionId });
  return updated.length ? "stored" : "stale";
}

/**
 * A purchase (or restore) reported by the app for the signed-in member. The
 * transaction must be Apple-signed, for one of our products, and carry this
 * member's account token.
 */
export async function recordApplePurchase(userId: string, signedTransaction: unknown): Promise<AppleResult> {
  const v = await verifyTransaction(signedTransaction as string);
  if (!v) return { ok: false, error: "invalid" };
  const { tx, env } = v;
  if (!isAppleProduct(tx.productId) || !tx.originalTransactionId) return { ok: false, error: "unknown_product" };
  if (tx.appAccountToken?.toLowerCase() !== appAccountToken(userId)) return { ok: false, error: "wrong_account" };
  const plan = APPLE_PRODUCTS[tx.productId].plan;
  // Xcode test purchases are unsigned: checked above, but never stored.
  if (env === Environment.XCODE) return { ok: true, stored: false, plan };
  const r = await applyState({ userId, tx, renewal: null, env });
  if (r === "other_account") return { ok: false, error: "wrong_account" };
  if (r === "stored") await track(userId, "apple_purchase_recorded", { plan, context: env === Environment.SANDBOX ? "sandbox" : "production" });
  return { ok: true, stored: r === "stored", plan };
}

/**
 * App Store Server Notifications (version 2): renewals, cancellations,
 * billing problems, refunds. Idempotent by notification id. Returns the HTTP
 * status for Apple: 200 when handled or safely ignored, 400 for data that is
 * not Apple's, 500 to have Apple retry later.
 */
export async function handleAppleNotification(body: unknown): Promise<number> {
  const signedPayload = (body as { signedPayload?: unknown })?.signedPayload;
  if (typeof signedPayload !== "string" || signedPayload.length > 100_000) return 400;
  const verifier = verifierFor(claimedEnvironment(signedPayload));
  if (!verifier) return 400;
  let n;
  try {
    n = await verifier.verifyAndDecodeNotification(signedPayload);
  } catch {
    return 400;
  }
  const id = n.notificationUUID;
  if (!id) return 400;
  const db = getDb();
  try {
    const [seen] = await db.select({ id: appleNotifications.id }).from(appleNotifications).where(eq(appleNotifications.id, id)).limit(1);
    if (seen) return 200;
    const data = n.data;
    if (data?.signedTransactionInfo) {
      const tx = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo);
      const renewal = data.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo) : null;
      if (isAppleProduct(tx.productId) && tx.originalTransactionId) {
        // Only subscriptions the app has already tied to an account are updated; the app reports new ones itself.
        const [row] = await db.select({ userId: appleSubscriptions.userId }).from(appleSubscriptions).where(eq(appleSubscriptions.originalTransactionId, tx.originalTransactionId)).limit(1);
        if (row) await applyState({ userId: row.userId, tx, renewal, env: String(data.environment ?? "") });
      }
    }
    await db.insert(appleNotifications).values({ id, type: `${n.notificationType ?? "?"}${n.subtype ? `:${n.subtype}` : ""}`.slice(0, 80) }).onConflictDoNothing();
    return 200;
  } catch {
    // E.g. the database is unreachable, or the migration has not run yet: Apple retries later.
    return 500;
  }
}

import { describe, expect, it } from "vitest";
import { APPLE_EXPIRY_LEEWAY_MS, APPLE_PRODUCTS, APPLE_PRODUCT_IDS, appleRecord, appleStateFrom, combinedEntitlements, isAppleProduct, type AppleRow } from "@/lib/billing/apple";
import { appAccountToken } from "@/lib/billing/apple-token";
import { isNativeApp } from "@/lib/native";

const now = new Date("2026-11-09T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day);

describe("App Store products", () => {
  it("covers both paid plans, monthly and annual, under our bundle prefix", () => {
    expect(APPLE_PRODUCT_IDS).toHaveLength(4);
    expect(APPLE_PRODUCT_IDS.every(id => id.startsWith("com.berripop."))).toBe(true);
    const pairs = Object.values(APPLE_PRODUCTS).map(p => `${p.plan}:${p.interval}`).sort();
    expect(pairs).toEqual(["premium:month", "premium:year", "premium_plus:month", "premium_plus:year"]);
  });
  it("recognises only our products", () => {
    expect(isAppleProduct("com.berripop.plus.annual")).toBe(true);
    expect(isAppleProduct("com.other.app.monthly")).toBe(false);
    expect(isAppleProduct(undefined)).toBe(false);
    expect(isAppleProduct("toString")).toBe(false);
  });
});

describe("appAccountToken", () => {
  it("is a stable UUID per account, different between accounts", () => {
    const a = appAccountToken("user_a");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(appAccountToken("user_a")).toBe(a);
    expect(appAccountToken("user_b")).not.toBe(a);
  });
});

describe("appleStateFrom", () => {
  it("is active before expiry", () => {
    expect(appleStateFrom({ expiresDate: at(10).getTime() }, null, now)).toEqual({ status: "active", expiresAt: at(10), autoRenew: true });
  });
  it("a refund (revocation) ends access at once", () => {
    expect(appleStateFrom({ expiresDate: at(10).getTime(), revocationDate: at(-1).getTime() }, null, now).status).toBe("revoked");
  });
  it("keeps access in the billing grace period, not in billing retry", () => {
    expect(appleStateFrom({ expiresDate: at(-1).getTime() }, { gracePeriodExpiresDate: at(3).getTime(), isInBillingRetryPeriod: true }, now)).toEqual({ status: "grace", expiresAt: at(3), autoRenew: true });
    expect(appleStateFrom({ expiresDate: at(-1).getTime() }, { isInBillingRetryPeriod: true }, now).status).toBe("billing_retry");
    expect(appleStateFrom({ expiresDate: at(-1).getTime() }, null, now).status).toBe("expired");
  });
  it("reads auto-renew from renewal info, else keeps the stored value", () => {
    expect(appleStateFrom({ expiresDate: at(5).getTime() }, { autoRenewStatus: 0 }, now).autoRenew).toBe(false);
    expect(appleStateFrom({ expiresDate: at(5).getTime() }, null, now, false).autoRenew).toBe(false);
  });
});

const row = (over: Partial<AppleRow> = {}): AppleRow => ({ planId: "premium", interval: "month", status: "active", expiresAt: at(10), autoRenew: true, ...over });

describe("appleRecord", () => {
  it("maps active, grace and the rest", () => {
    expect(appleRecord(row(), now).status).toBe("active");
    expect(appleRecord(row({ status: "grace" }), now).status).toBe("past_due");
    expect(appleRecord(row({ status: "billing_retry" }), now).status).toBe("canceled");
    expect(appleRecord(row({ status: "revoked" }), now).status).toBe("canceled");
  });
  it("allows a short leeway past the stored expiry, then ends", () => {
    expect(appleRecord(row({ expiresAt: new Date(now.getTime() - APPLE_EXPIRY_LEEWAY_MS + 60_000) }), now).status).toBe("active");
    expect(appleRecord(row({ expiresAt: new Date(now.getTime() - APPLE_EXPIRY_LEEWAY_MS - 60_000) }), now).status).toBe("canceled");
  });
  it("turned-off renewal shows as ending at period end", () => {
    expect(appleRecord(row({ autoRenew: false }), now).cancelAtPeriodEnd).toBe(true);
  });
});

describe("combinedEntitlements", () => {
  const stripe = (planId: string) => ({ planId, interval: "month", status: "active", currentPeriodEnd: at(20), cancelAtPeriodEnd: false });
  it("free without anything", () => {
    const e = combinedEntitlements(null, [], now);
    expect(e.plan).toBe("free");
    expect(e.source).toBeNull();
  });
  it("an App Store subscription alone gives its plan", () => {
    const e = combinedEntitlements(null, [row({ planId: "premium_plus" })], now);
    expect(e.plan).toBe("premium_plus");
    expect(e.source).toBe("apple");
  });
  it("an expired App Store subscription gives nothing", () => {
    expect(combinedEntitlements(null, [row({ status: "expired", expiresAt: at(-5) })], now).plan).toBe("free");
  });
  it("the higher plan wins; on a tie Stripe wins", () => {
    expect(combinedEntitlements(stripe("premium"), [row({ planId: "premium_plus" })], now).source).toBe("apple");
    expect(combinedEntitlements(stripe("premium_plus"), [row({ planId: "premium" })], now).source).toBe("stripe");
    expect(combinedEntitlements(stripe("premium"), [row()], now).source).toBe("stripe");
  });
});

describe("signup source detection", () => {
  it("the iPhone app's user agent marks an App Store signup", () => {
    expect(isNativeApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 BerripopApp/1")).toBe(true);
    expect(isNativeApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(false);
  });
});

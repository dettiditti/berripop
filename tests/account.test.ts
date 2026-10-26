import { describe, expect, it } from "vitest";
import { deletionBlock, isDeleteConfirmation } from "../lib/account/policy";

describe("account deletion rules", () => {
  it("needs the exact confirmation word, in either language", () => {
    expect(isDeleteConfirmation("TÖRLÉS")).toBe(true);
    expect(isDeleteConfirmation("  törlés ")).toBe(true);
    expect(isDeleteConfirmation("delete")).toBe(true);
    expect(isDeleteConfirmation("torles")).toBe(false);
    expect(isDeleteConfirmation("yes")).toBe(false);
    expect(isDeleteConfirmation(undefined)).toBe(false);
  });
  it("blocks deletion while a subscription would keep renewing", () => {
    expect(deletionBlock({ plan: "premium", cancelAtPeriodEnd: false })).toBe("active_subscription");
    expect(deletionBlock({ plan: "premium", cancelAtPeriodEnd: true })).toBeNull();
    expect(deletionBlock({ plan: "premium_plus", cancelAtPeriodEnd: false })).toBe("active_subscription");
    expect(deletionBlock({ plan: "premium_plus", cancelAtPeriodEnd: true })).toBeNull();
    expect(deletionBlock({ plan: "free", cancelAtPeriodEnd: false })).toBeNull();
  });
});

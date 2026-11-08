import { describe, expect, it } from "vitest";
import { OFFER_AFTER_ACTIVE_DAYS, offerAllowed } from "@/lib/billing/prompt-policy";

const base = { kind: "path", atLimit: false, activeDays: OFFER_AFTER_ACTIVE_DAYS, claimedThisVisit: null };

describe("offerAllowed", () => {
  it("waits until the member was active on a few days", () => {
    expect(offerAllowed({ ...base, activeDays: 0 })).toBe(false);
    expect(offerAllowed({ ...base, activeDays: OFFER_AFTER_ACTIVE_DAYS - 1 })).toBe(false);
    expect(offerAllowed(base)).toBe(true);
  });
  it("shows at most one plain offer per visit, but the same one again", () => {
    expect(offerAllowed({ ...base, claimedThisVisit: "summary" })).toBe(false);
    expect(offerAllowed({ ...base, claimedThisVisit: "path" })).toBe(true);
  });
  it("always explains a reached limit, even on day one and after another offer", () => {
    expect(offerAllowed({ ...base, atLimit: true, activeDays: 0, claimedThisVisit: "summary" })).toBe(true);
  });
});

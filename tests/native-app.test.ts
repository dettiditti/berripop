import { describe, expect, it } from "vitest";
import { inAppAuthAppearance } from "../lib/auth-appearance";
import { dictionaries } from "../lib/i18n/dictionaries";
import { isNativeApp } from "../lib/native";

const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("phone app detection", () => {
  it("recognises the Berripop app's user agent suffix", () => {
    expect(isNativeApp(`${safari} BerripopApp/1`)).toBe(true);
    expect(isNativeApp(`${safari} BerripopApp/12`)).toBe(true);
  });
  it("treats every ordinary browser as the website", () => {
    expect(isNativeApp(safari)).toBe(false);
    expect(isNativeApp(`${safari} BerripopApp`)).toBe(false);
    expect(isNativeApp(`${safari} NotBerripopApp/1`)).toBe(false);
    expect(isNativeApp("")).toBe(false);
    expect(isNativeApp(null)).toBe(false);
    expect(isNativeApp(undefined)).toBe(false);
  });
});

describe("nothing is sold inside the phone app", () => {
  it("explains limits without any offer, price or plan name", () => {
    for (const d of Object.values(dictionaries)) {
      for (const note of Object.values(d.billing.appLimits)) {
        expect(note).not.toMatch(/premium|prémium|plus|ft|huf|€|\$|\/ ?hó|month|előfizet|subscri/i);
      }
      expect(d.billing.appLimits.ai).toContain("{date}");
    }
  });
  it("hides Google sign-in and its divider, nothing else", () => {
    expect(Object.keys(inAppAuthAppearance.elements).sort()).toEqual(["dividerRow", "socialButtonsRoot"]);
  });
});

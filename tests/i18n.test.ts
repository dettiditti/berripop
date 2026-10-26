import { describe, expect, it } from "vitest";
import { en } from "../lib/i18n/dictionaries/en";
import { hu } from "../lib/i18n/dictionaries/hu";
import { makeI18n } from "../lib/i18n/format";

function leaves(obj: unknown, path = ""): [string, unknown][] {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, obj]];
}

describe("subscription localization", () => {
  for (const ns of ["billing", "goals", "aiAssist", "journal", "landing", "auth", "onboarding", "personal", "assessment", "account"] as const) {
    it(`${ns} has the same non-empty keys in Hungarian and English`, () => {
      const enLeaves = leaves(en[ns]);
      const huLeaves = new Map(leaves(hu[ns]));
      for (const [key, value] of enLeaves) {
        expect(huLeaves.has(key), key).toBe(true);
        const huValue = huLeaves.get(key);
        const flat = (v: unknown) => (Array.isArray(v) ? v.join("") : typeof v === "object" && v ? Object.values(v).join("") : String(v));
        expect(flat(value).length, `en ${key}`).toBeGreaterThan(0);
        expect(flat(huValue).length, `hu ${key}`).toBeGreaterThan(0);
      }
    });
  }
  it("translates plan names, intervals and statuses", () => {
    expect(hu.billing.monthly).toBe("Havi");
    expect(en.billing.annual).toBe("Annual");
    expect(hu.billing.settings.statuses.past_due).not.toBe(en.billing.settings.statuses.past_due);
  });
  it("formats forint prices per locale", () => {
    expect(makeI18n("hu").money(2990, "HUF")).toMatch(/2\s?990\s?Ft/);
    expect(makeI18n("en").money(2990, "HUF")).toMatch(/2,990/);
  });
});

import { describe, expect, it } from "vitest";
import { countryAllowed, publicSalesInfo, salesConfig, salesProblems } from "../lib/billing/sales";
import { aiConsentRequired, LEGAL_VERSIONS, legalState, type LegalRecordRow } from "../lib/legal/records";
import { retentionDays } from "../lib/retention/policy";

describe("sales and tax configuration", () => {
  it("allows checkout in Hungary without any invoicing provider or VAT key configured", () => {
    const cfg = salesConfig({});
    expect(cfg.countries).toEqual(["HU"]);
    expect(cfg.invoicing).toBe("manual");
    expect(salesProblems(cfg)).toEqual([]);
    expect(publicSalesInfo({})).toEqual({ available: true, countries: ["HU"], taxNote: null });
  });
  it("ignores the deferred provider settings", () => {
    const env = { INVOICING_MODE: "szamlazz", SZAMLAZZ_AGENT_KEY: "k" };
    expect(salesConfig(env).invoicing).toBe("manual");
    expect(salesProblems(salesConfig(env))).toEqual([]);
  });
  it("shows the AAM note only when AAM is the configured Hungarian treatment", () => {
    expect(publicSalesInfo({ INVOICE_VAT_KEY_HU: "AAM" }).taxNote).toBe("aam");
    expect(publicSalesInfo({ INVOICE_VAT_KEY_HU: "27" }).taxNote).toBeNull();
  });
  it("keeps EU sales disabled unless explicitly enabled with an approved key per country", () => {
    const off = salesConfig({ SALES_COUNTRIES: "HU,DE,US", INVOICE_VAT_KEY_DE: "AAM" });
    expect(off.countries).toEqual(["HU"]);
    expect(off.disabled).toEqual([{ country: "DE", reason: "eu_sales_disabled" }, { country: "US", reason: "not_eu" }]);
    expect(countryAllowed(off, "DE")).toBe(false);
    const noKey = salesConfig({ SALES_COUNTRIES: "HU,AT", EU_SALES_ENABLED: "true" });
    expect(noKey.disabled).toEqual([{ country: "AT", reason: "missing_vat_key" }]);
    const on = salesConfig({ SALES_COUNTRIES: "HU,AT", EU_SALES_ENABLED: "true", INVOICE_VAT_KEY_AT: "X" });
    expect(countryAllowed(on, "at")).toBe(true);
    expect(countryAllowed(on, null)).toBe(false);
  });
  it("sells nowhere when no enabled country is left", () => {
    const cfg = salesConfig({ SALES_COUNTRIES: "US" });
    expect(salesProblems(cfg)).toEqual(["no_country"]);
    expect(publicSalesInfo({ SALES_COUNTRIES: "US" }).available).toBe(false);
  });
});

describe("terms acceptance and AI consent records", () => {
  const row = (kind: string, version: string, granted: boolean, t: number): LegalRecordRow => ({ kind, version, granted, createdAt: new Date(t) });
  it("reads the latest record of each kind", () => {
    expect(legalState([], "terms", LEGAL_VERSIONS.terms)).toBe("missing");
    expect(legalState([row("terms", LEGAL_VERSIONS.terms, true, 1)], "terms", LEGAL_VERSIONS.terms)).toBe("granted");
    expect(legalState([row("ai_processing", "v1", true, 1), row("ai_processing", "v1", false, 2)], "ai_processing", "v1")).toBe("withdrawn");
    expect(legalState([row("ai_processing", "v1", false, 1), row("ai_processing", "v1", true, 2)], "ai_processing", "v1")).toBe("granted");
  });
  it("asks again after a version change", () => {
    expect(legalState([row("terms", "2026-01-01", true, 1)], "terms", "2026-10-27")).toBe("outdated");
  });
  it("requires AI consent unless explicitly switched off", () => {
    expect(aiConsentRequired({})).toBe(true);
    expect(aiConsentRequired({ AI_CONSENT_MODE: "required" })).toBe(true);
    expect(aiConsentRequired({ AI_CONSENT_MODE: "not_required" })).toBe(false);
  });
});

describe("retention", () => {
  it("deletes nothing unless a period is configured, and refuses too short webhook periods", () => {
    expect(retentionDays({})).toEqual({});
    expect(retentionDays({ RETENTION_FUNNEL_EVENTS_DAYS: "365", RETENTION_STRIPE_EVENTS_DAYS: "3", RETENTION_AI_CALLS_DAYS: "abc" })).toEqual({ funnel_events: 365 });
  });
});

/**
 * Where Berripop may sell, and how sales are taxed and invoiced. Values come
 * from environment variables that the operator sets only after the accountant
 * has approved them; nothing here is a tax rule of its own.
 *
 * Invoicing is manual for now (INVOICING_MODE is fixed to "manual"): no
 * invoicing provider is called, and Stripe receipts are not treated as the
 * required invoice. Every paid Stripe invoice becomes a follow-up task in
 * `invoices` for the operator to issue the invoice by hand
 * (docs/production-readiness.md).
 *
 *   SALES_COUNTRIES        billing countries, ISO 3166-1 alpha-2, comma separated (default "HU")
 *   EU_SALES_ENABLED       "true" allows EU countries other than HU (default off)
 *   INVOICE_VAT_KEY_HU     optional: the approved VAT treatment for Hungary, e.g. "AAM" (only shown as a price note)
 *   INVOICE_VAT_KEY_<CC>   required for every other enabled country
 */

export const HOME_COUNTRY = "HU";

/** EU member states (ISO 3166-1 alpha-2). */
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

/** The only invoicing mode in this version: the operator issues every invoice by hand. */
export type InvoicingMode = "manual";
export const INVOICING_MODE: InvoicingMode = "manual";

export type SalesConfig = {
  /** Countries a member may be billed in. */
  countries: string[];
  /** Configured countries that stay off, with the reason (shown to the operator, never to members). */
  disabled: { country: string; reason: "not_eu" | "eu_sales_disabled" | "missing_vat_key" }[];
  /** Approved VAT treatment per country, where configured. */
  vatKeys: Record<string, string>;
  invoicing: InvoicingMode;
};

type Env = Record<string, string | undefined>;

export function salesConfig(env: Env): SalesConfig {
  const wanted = (env.SALES_COUNTRIES ?? HOME_COUNTRY).split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const euOn = env.EU_SALES_ENABLED === "true";
  const countries: string[] = [];
  const disabled: SalesConfig["disabled"] = [];
  const vatKeys: Record<string, string> = {};
  for (const c of [...new Set(wanted)]) {
    const key = env[`INVOICE_VAT_KEY_${c}`]?.trim();
    if (key) vatKeys[c] = key;
    if (!(EU_COUNTRIES as readonly string[]).includes(c)) disabled.push({ country: c, reason: "not_eu" });
    else if (c === HOME_COUNTRY) countries.push(c);
    else if (!euOn) disabled.push({ country: c, reason: "eu_sales_disabled" });
    else if (!key) disabled.push({ country: c, reason: "missing_vat_key" });
    else countries.push(c);
  }
  for (const c of disabled) delete vatKeys[c.country];
  return { countries, disabled, vatKeys, invoicing: INVOICING_MODE };
}

export type SalesProblem = "no_country";

/** Checkout is offered only when this returns no problems. The deferred invoicing provider is not one. */
export function salesProblems(cfg: SalesConfig): SalesProblem[] {
  return cfg.countries.length ? [] : ["no_country"];
}

export function countryAllowed(cfg: SalesConfig, country: string | null | undefined): boolean {
  return !!country && cfg.countries.includes(country.toUpperCase());
}

/** What the pricing page may show: no secrets, no operator detail. */
export type PublicSalesInfo = {
  available: boolean;
  countries: string[];
  /** Only "aam" has an approved wording today; any other key shows no tax note. */
  taxNote: "aam" | null;
};

export function publicSalesInfo(env: Env): PublicSalesInfo {
  const cfg = salesConfig(env);
  const available = salesProblems(cfg).length === 0;
  const keys = new Set(cfg.countries.map(c => cfg.vatKeys[c]));
  return { available, countries: cfg.countries, taxNote: available && keys.size === 1 && keys.has("AAM") ? "aam" : null };
}

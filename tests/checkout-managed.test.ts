import { beforeEach, describe, expect, it, vi } from "vitest";
import { entitlementsFrom } from "../lib/billing/entitlements";

/*
 * Checkout routing by the buyer's region: Hungary keeps the regular,
 * hand-invoiced checkout; any other country goes through Stripe Managed
 * Payments, only when MANAGED_PAYMENTS_ENABLED is on. Stripe and the database
 * are in-memory stand-ins; nothing reaches Stripe or Neon.
 */

const created: Record<string, unknown>[] = [];
const priceLists: Record<string, unknown>[] = [];
type Product = { id: string; active?: boolean; deleted?: boolean; metadata?: Record<string, string> };
const product = (plan: string | null, patch: Partial<Product> = {}): Product => ({ id: `prod_${plan}`, active: true, metadata: plan === null ? {} : { kozos_plan: plan }, ...patch });
/** What Stripe returns per lookup key; the real catalog by default (scripts/stripe-setup.ts). */
let catalog: Record<string, { id: string; lookup_key: string; product: Product | string }[]> = {};
const realCatalog = () => ({
  kozos_premium_monthly_huf: [{ id: "price_pm", lookup_key: "kozos_premium_monthly_huf", product: product("premium") }],
  kozos_premium_annual_huf: [{ id: "price_pa", lookup_key: "kozos_premium_annual_huf", product: product("premium") }],
  kozos_premium_plus_monthly_huf: [{ id: "price_xm", lookup_key: "kozos_premium_plus_monthly_huf", product: product("premium_plus") }],
  kozos_premium_plus_annual_huf: [{ id: "price_xa", lookup_key: "kozos_premium_plus_annual_huf", product: product("premium_plus") }],
});
const retrieved: Record<string, Record<string, unknown>> = {};
const portal: Record<string, unknown>[] = [];

vi.mock("server-only", () => ({}));
vi.mock("../lib/billing/stripe", () => ({
  isTestMode: () => true,
  getStripe: () => ({
    prices: { list: async (p: { lookup_keys: string[] }) => (priceLists.push(p), { data: catalog[p.lookup_keys[0]] ?? [] }) },
    customers: { create: async () => ({ id: "cus_new" }) },
    checkout: { sessions: { create: async (p: Record<string, unknown>) => (created.push(p), { id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }) } },
    subscriptions: { retrieve: async (id: string) => retrieved[id] },
    billingPortal: { sessions: { create: async (p: Record<string, unknown>) => (portal.push(p), { url: "https://billing.stripe.com/p/1" }) } },
  }),
}));
let entitlements = entitlementsFrom(null);
vi.mock("../lib/server/entitlements", () => ({ getUserEntitlements: async () => entitlements }));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: "user_a", stripeCustomerId: "cus_a", stripeSubscriptionId: "sub_1" }] }) }) }),
  }),
}));
vi.mock("../lib/server/analytics", () => ({ track: async () => {} }));
vi.mock("../lib/server/invoicing", () => ({ enqueueInvoice: async () => {}, enqueueReversal: async () => {} }));
vi.mock("../lib/server/legal", () => ({ recordCheckoutDisclosure: async () => {} }));

const { createCheckoutSession, createPlanChangeSession, soldThroughManagedPayments } = await import("../lib/server/billing");
const checkout = (region?: "home" | "abroad", plan: "premium" | "premium_plus" = "premium", interval: "month" | "year" = "month") =>
  createCheckoutSession("user_a", plan, interval, "https://www.berripop.com", { region });
const lineItemPrice = () => (created[0].line_items as { price: string }[])[0].price;

beforeEach(() => {
  created.length = portal.length = priceLists.length = 0;
  catalog = realCatalog();
  entitlements = entitlementsFrom(null);
  vi.unstubAllEnvs();
});

describe("Hungarian buyers", () => {
  it.each([undefined, "home" as const])("keep the regular checkout (region %s), whatever the flag", async region => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    expect((await checkout(region)).ok).toBe(true);
    const p = created[0];
    expect(p).not.toHaveProperty("managed_payments");
    expect(p).toMatchObject({ billing_address_collection: "required", customer_update: { address: "auto", name: "auto" }, customer: "cus_a" });
    expect((p.metadata as Record<string, string>).channel).toBeUndefined();
    expect((p.subscription_data as { metadata: Record<string, string> }).metadata.channel).toBeUndefined();
  });
});

describe("buyers abroad", () => {
  it("go through Managed Payments, without the parameters it doesn't accept", async () => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    expect(await checkout("abroad")).toEqual({ ok: true, url: "https://checkout.stripe.com/c/cs_1" });
    const p = created[0];
    expect(p.managed_payments).toEqual({ enabled: true });
    for (const k of ["customer_update", "billing_address_collection", "automatic_tax", "tax_id_collection", "payment_method_types", "invoice_creation"]) expect(p).not.toHaveProperty(k);
    expect(p).toMatchObject({ mode: "subscription", customer: "cus_a", client_reference_id: "user_a" });
    expect(p.metadata).toMatchObject({ userId: "user_a", channel: "managed" });
    expect((p.subscription_data as { metadata: Record<string, string> }).metadata).toMatchObject({ userId: "user_a", channel: "managed" });
  });

  it.each([undefined, "false", "1"])("are refused while MANAGED_PAYMENTS_ENABLED is %s; no session is created", async flag => {
    if (flag !== undefined) vi.stubEnv("MANAGED_PAYMENTS_ENABLED", flag);
    expect(await checkout("abroad")).toEqual({ ok: false, error: "sales_unavailable" });
    expect(created).toEqual([]);
  });

  it("an existing subscriber still gets no second subscription", async () => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    entitlements = entitlementsFrom({ planId: "premium", status: "active", interval: "month", currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false });
    expect(await checkout("abroad")).toEqual({ ok: false, error: "already_premium" });
    expect(created).toEqual([]);
  });
});

describe("recognising a Managed Payments subscription", () => {
  it("by Stripe's own flag, or by our metadata", () => {
    expect(soldThroughManagedPayments({ managed_payments: { enabled: true }, metadata: {} })).toBe(true);
    expect(soldThroughManagedPayments({ managed_payments: null, metadata: { channel: "managed" } })).toBe(true);
    expect(soldThroughManagedPayments({ managed_payments: { enabled: false }, metadata: {} })).toBe(false);
    expect(soldThroughManagedPayments({ metadata: {} })).toBe(false);
  });

  it("the direct plan switch is not offered for it (untried); a Hungarian subscription still gets it", async () => {
    entitlements = entitlementsFrom({ planId: "premium", status: "active", interval: "month", currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false });
    retrieved.sub_1 = { id: "sub_1", managed_payments: { enabled: true }, metadata: {}, items: { data: [{ id: "si_1" }] } };
    expect(await createPlanChangeSession("user_a", "premium_plus", "https://www.berripop.com")).toEqual({ ok: false, error: "plan_change_unavailable" });
    expect(portal).toEqual([]);
    retrieved.sub_1 = { id: "sub_1", managed_payments: null, metadata: {}, items: { data: [{ id: "si_1" }] } };
    expect((await createPlanChangeSession("user_a", "premium_plus", "https://www.berripop.com")).ok).toBe(true);
    expect(portal).toHaveLength(1);
  });
});

describe("only the two Berripop products are sold", () => {
  it.each([
    ["premium", "month", "price_pm"], ["premium", "year", "price_pa"],
    ["premium_plus", "month", "price_xm"], ["premium_plus", "year", "price_xa"],
  ] as const)("%s %s: the price of the matching product is used, in both routes", async (plan, interval, priceId) => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    for (const region of ["home", "abroad"] as const) {
      created.length = 0;
      expect((await checkout(region, plan, interval)).ok).toBe(true);
      expect(lineItemPrice()).toBe(priceId);
    }
    expect(priceLists[0]).toMatchObject({ active: true, expand: ["data.product"] });
  });

  const broken: [string, () => void][] = [
    ["no kozos_plan metadata", () => { catalog.kozos_premium_monthly_huf[0].product = product(null); }],
    ["metadata of the other plan (Premium Plus product)", () => { catalog.kozos_premium_monthly_huf[0].product = product("premium_plus"); }],
    ["an unknown metadata value", () => { catalog.kozos_premium_monthly_huf[0].product = product("premium_monthly"); }],
    ["metadata with different case", () => { catalog.kozos_premium_monthly_huf[0].product = product("Premium"); }],
    ["another product entirely, with the lookup key moved to it", () => { catalog.kozos_premium_monthly_huf[0].product = { id: "prod_ebook", active: true, metadata: { kind: "ebook" } }; }],
    ["an archived product", () => { catalog.kozos_premium_monthly_huf[0].product = product("premium", { active: false }); }],
    ["a deleted product", () => { catalog.kozos_premium_monthly_huf[0].product = { id: "prod_x", deleted: true }; }],
    ["the product not expanded (only its id)", () => { catalog.kozos_premium_monthly_huf[0].product = "prod_premium"; }],
    ["a price whose lookup key isn't ours", () => { catalog.kozos_premium_monthly_huf[0].lookup_key = "someone_elses_key"; }],
    ["no price for the lookup key", () => { catalog.kozos_premium_monthly_huf = []; }],
  ];

  it.each(broken)("fails closed for %s: no Managed Payments session is created", async (_, breakIt) => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    breakIt();
    expect(await checkout("abroad")).toEqual({ ok: false, error: "billing_unavailable" });
    expect(created).toEqual([]);
  });

  it.each(broken)("fails closed for %s in the Hungarian route too", async (_, breakIt) => {
    breakIt();
    expect(await checkout("home")).toEqual({ ok: false, error: "billing_unavailable" });
    expect(created).toEqual([]);
  });

  it("a Premium Plus product behind a Premium key never sells Premium Plus either way round", async () => {
    vi.stubEnv("MANAGED_PAYMENTS_ENABLED", "true");
    catalog.kozos_premium_plus_monthly_huf[0].product = product("premium");
    expect((await checkout("abroad", "premium_plus")).ok).toBe(false);
    expect((await checkout("abroad", "premium")).ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(lineItemPrice()).toBe("price_pm");
  });

  it("the plan switch also refuses a price of the wrong product", async () => {
    entitlements = entitlementsFrom({ planId: "premium", status: "active", interval: "month", currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false });
    retrieved.sub_1 = { id: "sub_1", managed_payments: null, metadata: {}, items: { data: [{ id: "si_1" }] } };
    catalog.kozos_premium_plus_monthly_huf[0].product = product(null);
    expect(await createPlanChangeSession("user_a", "premium_plus", "https://www.berripop.com")).toEqual({ ok: false, error: "billing_unavailable" });
    expect(portal).toEqual([]);
  });
});

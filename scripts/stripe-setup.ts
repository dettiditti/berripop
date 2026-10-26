/**
 * Creates (or reuses) the Stripe catalog: one Product per paid plan (Berripop
 * Premium: monthly + annual HUF Price; Berripop Premium Plus: monthly HUF Price),
 * plus the Customer Portal configuration that lets members switch between them.
 * Idempotent: safe to run repeatedly; existing prices that already match are
 * kept untouched. Refuses to run against live keys unless STRIPE_SETUP_ALLOW_LIVE=1.
 *
 *   npm run stripe:setup
 */
import Stripe from "stripe";
import { PAID_PLANS, PLAN_PRODUCTS, PRICES, PRODUCT_METADATA_KEY, stripeAmount } from "../lib/billing/plans";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set (run `vercel env pull .env.local`).");
  if (!/^(sk|rk)_test_/.test(key) && process.env.STRIPE_SETUP_ALLOW_LIVE !== "1") throw new Error("Refusing to run against a live key.");
  const stripe = new Stripe(key);

  const portalProducts: { product: string; prices: string[] }[] = [];
  for (const plan of PAID_PLANS) {
    const meta = PLAN_PRODUCTS[plan];
    const found = await stripe.products.search({ query: `metadata['${PRODUCT_METADATA_KEY}']:'${meta.metadataValue}' AND active:'true'` });
    const product = found.data[0] ?? (await stripe.products.create({ name: meta.name, metadata: { [PRODUCT_METADATA_KEY]: meta.metadataValue } }));
    console.log(`product ${plan}: ${product.id}${found.data[0] ? "" : " (created)"}`);

    const priceIds: string[] = [];
    for (const cfg of Object.values(PRICES).filter(p => p.plan === plan)) {
      const existing = await stripe.prices.list({ lookup_keys: [cfg.lookupKey], active: true, limit: 1 });
      const current = existing.data[0];
      if (current && current.unit_amount === stripeAmount(cfg) && current.currency === cfg.currency.toLowerCase() && current.recurring?.interval === cfg.interval) {
        console.log(`price ${cfg.id}: ${current.id} (unchanged)`);
        priceIds.push(current.id);
        continue;
      }
      // Prices are immutable: create a new one and move the lookup key to it.
      const created = await stripe.prices.create({
        product: product.id,
        currency: cfg.currency.toLowerCase(),
        unit_amount: stripeAmount(cfg),
        recurring: { interval: cfg.interval },
        lookup_key: cfg.lookupKey,
        transfer_lookup_key: true,
      });
      console.log(`price ${cfg.id}: ${created.id} (created)`);
      priceIds.push(created.id);
    }
    portalProducts.push({ product: product.id, prices: priceIds });
  }

  const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: portalProducts,
    },
  };
  if (defaults.data[0]) {
    await stripe.billingPortal.configurations.update(defaults.data[0].id, { features });
    console.log(`portal configuration: ${defaults.data[0].id} (updated)`);
  } else {
    const cfg = await stripe.billingPortal.configurations.create({ features, business_profile: { headline: "Berripop" } });
    console.log(`portal configuration: ${cfg.id} (created)`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

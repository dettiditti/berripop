import "server-only";
import Stripe from "stripe";

/**
 * Integration boundary: returns null when Stripe isn't configured, so the app
 * shows "billing unavailable" instead of pretending payments work.
 * Keys come only from environment variables (never source code).
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export function isTestMode(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.match(/^(sk|rk)_test_/);
}

/**
 * Central plan, price and limit configuration. Change numbers here only.
 *
 * Prices are business hypotheses for the Hungarian market and may change.
 * Amounts are in the currency's major unit (forint). Stripe stores HUF with two
 * decimals, so `stripeAmount` multiplies by 100.
 */

export type PlanId = "free" | "premium" | "premium_plus";
/** The plans a Stripe subscription can grant. */
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";
export type PriceId = "monthly" | "annual" | "plus_monthly" | "plus_annual";
export type CurrencyCode = "HUF";

export type PlanLimits = {
  /** Active (not paused) growth goals at the same time. */
  activeGoals: number;
  /** AI-assisted interactions per allowance period. */
  aiPerPeriod: number;
  /** Circles a user can own (joining others is always free). */
  ownedCircles: number;
  /** AI weekly growth summary. */
  weeklySummary: boolean;
  /** AI reflections on journal entries per allowance period (separate from follow-ups). */
  journalAiPerPeriod: number;
  /** AI weekly journal reflection. */
  weeklyJournal: boolean;
  /** Use the member's approved growth insights to personalise journal reflections. */
  insightContext: boolean;
  /** AI calls for the My Path assessment per allowance period (each assessment is also capped at MAX_AI_CALLS). */
  assessmentAiPerPeriod: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { activeGoals: 1, aiPerPeriod: 5, ownedCircles: 1, weeklySummary: false, journalAiPerPeriod: 3, weeklyJournal: false, insightContext: false, assessmentAiPerPeriod: 6 },
  premium: { activeGoals: 5, aiPerPeriod: 60, ownedCircles: 5, weeklySummary: true, journalAiPerPeriod: 40, weeklyJournal: true, insightContext: true, assessmentAiPerPeriod: 12 },
  // Higher, still capped weekly limits (fair use and cost protection, never "unlimited").
  // Worst case at gpt-5-mini prices is about USD 1.9 per month per member (Premium: about USD 1).
  premium_plus: { activeGoals: 10, aiPerPeriod: 120, ownedCircles: 10, weeklySummary: true, journalAiPerPeriod: 80, weeklyJournal: true, insightContext: true, assessmentAiPerPeriod: 20 },
};

export const PAID_PLANS: readonly PaidPlanId[] = ["premium", "premium_plus"];

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlanId {
  return plan === "premium" || plan === "premium_plus";
}

export type PriceConfig = {
  id: PriceId;
  plan: PaidPlanId;
  interval: BillingInterval;
  amount: number;
  currency: CurrencyCode;
  /** Stable Stripe lookup key, so code never hardcodes Stripe price ids. */
  lookupKey: string;
};

export const PRICES: Record<PriceId, PriceConfig> = {
  monthly: { id: "monthly", plan: "premium", interval: "month", amount: 2990, currency: "HUF", lookupKey: "kozos_premium_monthly_huf" },
  annual: { id: "annual", plan: "premium", interval: "year", amount: 23990, currency: "HUF", lookupKey: "kozos_premium_annual_huf" },
  plus_monthly: { id: "plus_monthly", plan: "premium_plus", interval: "month", amount: 3990, currency: "HUF", lookupKey: "kozos_premium_plus_monthly_huf" },
  plus_annual: { id: "plus_annual", plan: "premium_plus", interval: "year", amount: 31990, currency: "HUF", lookupKey: "kozos_premium_plus_annual_huf" },
};

/** One Stripe Product per paid plan, found by metadata (see scripts/stripe-setup.ts). */
export const PRODUCT_METADATA_KEY = "kozos_plan";
export const PLAN_PRODUCTS: Record<PaidPlanId, { name: string; metadataValue: PaidPlanId }> = {
  premium: { name: "Berripop Premium", metadataValue: "premium" },
  premium_plus: { name: "Berripop Premium Plus", metadataValue: "premium_plus" },
};

export function stripeAmount(price: PriceConfig): number {
  return price.amount * 100;
}

/** The price for a plan and interval, or null when the plan isn't sold that way. */
export function priceFor(plan: PaidPlanId, interval: BillingInterval): PriceConfig | null {
  return Object.values(PRICES).find(p => p.plan === plan && p.interval === interval) ?? null;
}

/** The plan a Stripe price grants, from its lookup key; null for prices that aren't ours. */
export function planForLookupKey(lookupKey: string | null | undefined): PaidPlanId | null {
  return Object.values(PRICES).find(p => p.lookupKey === lookupKey)?.plan ?? null;
}

/**
 * AI allowance policy: counts reset every Monday 00:00 in Europe/Budapest
 * (ISO week). Only explicit AI requests count; viewing saved content never does.
 */
export const AI_ALLOWANCE_TIME_ZONE = "Europe/Budapest";

export function aiPeriodKey(now = new Date()): string {
  const local = new Date(now.toLocaleString("en-US", { timeZone: AI_ALLOWANCE_TIME_ZONE }));
  const day = (local.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(local);
  monday.setDate(local.getDate() - day);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The date (YYYY-MM-DD, Budapest) when the current allowance period ends. */
export function aiPeriodResets(now = new Date()): string {
  const [y, m, d] = aiPeriodKey(now).split("-").map(Number);
  const next = new Date(y, m - 1, d + 7);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** Default AI model (an exact AI Gateway id); override with AI_GATEWAY_MODEL. */
export const DEFAULT_AI_MODEL = "openai/gpt-5-mini";

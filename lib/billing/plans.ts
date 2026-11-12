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

/** The five AI allowances. Each AI request counts against exactly one of them. */
export type QuotaKey = "assist" | "journal" | "assessment" | "thought" | "relationship";

/**
 * How long an allowance lasts: a week (resets Monday 00:00, Europe/Budapest),
 * a calendar month, or "once" (never resets, for the lifetime of the account).
 */
export type QuotaWindow = "week" | "month" | "once";

/**
 * One allowance pool. A quota is a list of pools used in order: the first one
 * with room is charged. "once" pools are named so two one-time allowances
 * (e.g. the first free Gondolatboncoló and the one from the trial) stay
 * separate and each is used at most once.
 */
export type QuotaPool = { window: QuotaWindow; limit: number; name?: string };

/**
 * Who the limits are for: the three plans, plus the one-time 4-day trial
 * (Premium-like but capped, see TRIAL_DAYS). The trial is not a plan: billing
 * still says Free, only the limits change.
 */
export type Tier = PlanId | "trial";

export const TRIAL_DAYS = 4;

const week = (limit: number): QuotaPool[] => [{ window: "week", limit }];
const month = (limit: number): QuotaPool[] => [{ window: "month", limit }];
/** The first Gondolatboncoló, free once per account. */
const FIRST_THOUGHT: QuotaPool = { window: "once", limit: 1, name: "first" };
/** One more Gondolatboncoló during the trial, once per account. */
const TRIAL_THOUGHT: QuotaPool = { window: "once", limit: 1, name: "trial" };
/**
 * Kapcsolati világ: one AI insight (the communication translator) free once
 * per account, so Free members can taste it. Paid: weekly, about USD 0.002 a
 * call with the default model (lib/relationship/ai.ts caps the output).
 */
const FIRST_RELATIONSHIP: QuotaPool = { window: "once", limit: 1, name: "first" };

/**
 * THE central allowance configuration. Change numbers here only; the server
 * enforces exactly these (lib/server/quota.ts) and the UI only displays them.
 */
export const PLAN_QUOTAS: Record<Tier, Record<QuotaKey, readonly QuotaPool[]>> = {
  free: { assist: week(2), journal: week(1), assessment: week(6), thought: [FIRST_THOUGHT], relationship: [FIRST_RELATIONSHIP] },
  // Enough to try every feature during the week, never unlimited.
  trial: { assist: week(10), journal: week(5), assessment: week(12), thought: [FIRST_THOUGHT, TRIAL_THOUGHT], relationship: week(6) },
  premium: { assist: week(60), journal: week(15), assessment: week(12), thought: month(10), relationship: week(25) },
  premium_plus: { assist: week(120), journal: week(30), assessment: week(20), thought: month(20), relationship: week(50) },
};

/** The sum of a quota's pools (what the member can use at most in the current windows). */
export const quotaTotal = (pools: readonly QuotaPool[]) => pools.reduce((n, p) => n + p.limit, 0);
/** The window to show for a quota: the first pool's (the paid and free quotas each have one kind). */
export const quotaWindow = (pools: readonly QuotaPool[]): QuotaWindow => pools[0]?.window ?? "week";

export type PlanLimits = {
  /** Active (not paused) growth goals at the same time. */
  activeGoals: number;
  /** AI-assisted interactions per week (from PLAN_QUOTAS.assist). */
  aiPerPeriod: number;
  /** Circles a user can own (joining others is always free). */
  ownedCircles: number;
  /** AI weekly growth summary. */
  weeklySummary: boolean;
  /** AI reflections on journal entries per week (from PLAN_QUOTAS.journal). */
  journalAiPerPeriod: number;
  /** AI weekly journal reflection. */
  weeklyJournal: boolean;
  /** Use the member's approved growth insights to personalise journal reflections. */
  insightContext: boolean;
  /** AI calls for the My Path assessment per week (from PLAN_QUOTAS.assessment; each assessment is also capped at MAX_AI_CALLS). */
  assessmentAiPerPeriod: number;
  /** Gondolatboncoló sessions in `thoughtWindow` (from PLAN_QUOTAS.thought). Continuing one never counts. */
  thoughtSessions: number;
  /** "once" (Free, trial: one-time sessions) or "month" (paid). */
  thoughtWindow: QuotaWindow;
  /** Viewpoints Berri works through in one session (at most 6). */
  thoughtViewpoints: number;
  /** AI turns per session, the summary included (cost cap). */
  thoughtTurnsPerSession: number;
  /** Output token cap for one conversation turn; the summary gets twice this. */
  thoughtMaxOutputTokens: number;
  /** Premium: continue a finished session and look for patterns across sessions (opt-in per request). */
  thoughtDeep: boolean;
  /**
   * Safety net: estimated AI cost per member per calendar month (micro-USD,
   * from ai_calls). Set well above the most the allowances can use (about
   * USD 0.03 Free, 0.9 Premium, 2.7 Plus, the Kapcsolati világ included), so it only stops anomalies.
   */
  aiMonthlyCostCapMicroUsd: number;
};

type OwnLimits = Omit<PlanLimits, "aiPerPeriod" | "journalAiPerPeriod" | "assessmentAiPerPeriod" | "thoughtSessions" | "thoughtWindow">;

const OWN: Record<Tier, OwnLimits> = {
  free: { activeGoals: 1, ownedCircles: 1, weeklySummary: false, weeklyJournal: false, insightContext: false,
    thoughtViewpoints: 4, thoughtTurnsPerSession: 9, thoughtMaxOutputTokens: 500, thoughtDeep: false, aiMonthlyCostCapMicroUsd: 150_000 },
  trial: { activeGoals: 3, ownedCircles: 1, weeklySummary: true, weeklyJournal: true, insightContext: true,
    thoughtViewpoints: 6, thoughtTurnsPerSession: 18, thoughtMaxOutputTokens: 700, thoughtDeep: true, aiMonthlyCostCapMicroUsd: 500_000 },
  premium: { activeGoals: 5, ownedCircles: 5, weeklySummary: true, weeklyJournal: true, insightContext: true,
    thoughtViewpoints: 6, thoughtTurnsPerSession: 18, thoughtMaxOutputTokens: 700, thoughtDeep: true, aiMonthlyCostCapMicroUsd: 1_500_000 },
  // Higher, still capped limits (fair use and cost protection, never "unlimited").
  premium_plus: { activeGoals: 10, ownedCircles: 10, weeklySummary: true, weeklyJournal: true, insightContext: true,
    thoughtViewpoints: 6, thoughtTurnsPerSession: 24, thoughtMaxOutputTokens: 700, thoughtDeep: true, aiMonthlyCostCapMicroUsd: 4_000_000 },
};

function limitsFor(tier: Tier): PlanLimits {
  const q = PLAN_QUOTAS[tier];
  return {
    ...OWN[tier],
    aiPerPeriod: quotaTotal(q.assist),
    journalAiPerPeriod: quotaTotal(q.journal),
    assessmentAiPerPeriod: quotaTotal(q.assessment),
    thoughtSessions: quotaTotal(q.thought),
    thoughtWindow: quotaWindow(q.thought),
  };
}

export const PLAN_LIMITS: Record<Tier, PlanLimits> = {
  free: limitsFor("free"),
  trial: limitsFor("trial"),
  premium: limitsFor("premium"),
  premium_plus: limitsFor("premium_plus"),
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
  monthly: { id: "monthly", plan: "premium", interval: "month", amount: 2490, currency: "HUF", lookupKey: "kozos_premium_monthly_huf_2490" },
  annual: { id: "annual", plan: "premium", interval: "year", amount: 19990, currency: "HUF", lookupKey: "kozos_premium_annual_huf_19990" },
  plus_monthly: { id: "plus_monthly", plan: "premium_plus", interval: "month", amount: 3990, currency: "HUF", lookupKey: "kozos_premium_plus_monthly_huf" },
  plus_annual: { id: "plus_annual", plan: "premium_plus", interval: "year", amount: 31990, currency: "HUF", lookupKey: "kozos_premium_plus_annual_huf" },
};

/**
 * Earlier prices no longer sold. A subscription on one of them keeps its plan
 * (and its price, until the member changes it), so these keys still grant it.
 */
export const LEGACY_LOOKUP_KEYS: Record<string, PaidPlanId> = {
  kozos_premium_monthly_huf: "premium", // 2 990 Ft / month, until 2026-11
  kozos_premium_annual_huf: "premium", // 23 990 Ft / year, until 2026-11
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
  if (!lookupKey) return null;
  return Object.values(PRICES).find(p => p.lookupKey === lookupKey)?.plan ?? (Object.hasOwn(LEGACY_LOOKUP_KEYS, lookupKey) ? LEGACY_LOOKUP_KEYS[lookupKey] : null);
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

/** The Gondolatboncoló allowance period: the calendar month in Europe/Budapest, e.g. "2026-11". */
export function thoughtPeriodKey(now = new Date()): string {
  const local = new Date(now.toLocaleString("en-US", { timeZone: AI_ALLOWANCE_TIME_ZONE }));
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
}

/** The first day (YYYY-MM-DD) of the next Gondolatboncoló period. */
export function thoughtPeriodResets(now = new Date()): string {
  const [y, m] = thoughtPeriodKey(now).split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Default AI model (an exact AI Gateway id); override with AI_GATEWAY_MODEL. */
export const DEFAULT_AI_MODEL = "openai/gpt-5-mini";

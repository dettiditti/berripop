/**
 * Versioned AI price list used to ESTIMATE the cost of each call.
 *
 * These are estimates: the provider's invoice is authoritative and may differ
 * (regional surcharges, discounts, price changes). Prices are USD per 1 million
 * tokens, copied from the Vercel AI Gateway model catalog
 * (https://ai-gateway.vercel.sh/v1/models), which passes provider list prices
 * through without markup. Only models whose price was checked are listed; any
 * other model gets an unknown cost (null), never a fake zero.
 *
 * To update: add a new version, keep the old one for reference, and point
 * CURRENT_PRICE_LIST at it.
 */

export type ModelPrice = {
  /** USD per 1M non-cached input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens read; undefined = not known. */
  cacheRead?: number;
  /** USD per 1M cached input tokens written; undefined = not known. */
  cacheWrite?: number;
};

export type PriceList = { version: string; source: string; models: Record<string, ModelPrice> };

export const PRICE_LIST_2026_10_25: PriceList = {
  version: "2026-10-25",
  source: "https://ai-gateway.vercel.sh/v1/models (global, non-regional pricing)",
  models: {
    "openai/gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025 },
    "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    "anthropic/claude-sonnet-5.5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    "anthropic/claude-opus-5.5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
};

export const CURRENT_PRICE_LIST = PRICE_LIST_2026_10_25;

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};

/**
 * Estimated cost in integer micro-USD (1 USD = 1,000,000).
 *
 * Because prices are per 1M tokens, tokens × price is already micro-USD; the
 * sum is rounded UP to the next whole micro-USD so estimates never undercount.
 * Returns null (unknown) when the model has no listed price, when input or
 * output token counts are missing, or when cached tokens were reported but
 * the model's cache price is unknown. When the provider gives no cache
 * breakdown, all input is priced as non-cached (an upper bound).
 */
export function estimateCostMicroUsd(model: string, usage: TokenUsage, list: PriceList = CURRENT_PRICE_LIST): number | null {
  const price = list.models[model];
  if (!price || usage.inputTokens == null || usage.outputTokens == null) return null;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  if ((cacheRead > 0 && price.cacheRead == null) || (cacheWrite > 0 && price.cacheWrite == null)) return null;
  const uncached = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const micro =
    uncached * price.input +
    cacheRead * (price.cacheRead ?? 0) +
    cacheWrite * (price.cacheWrite ?? 0) +
    usage.outputTokens * price.output;
  // Round away floating-point noise first (e.g. 0.1 × 3 = 0.30000000000000004), then up.
  return Math.ceil(Math.round(micro * 1e6) / 1e6);
}

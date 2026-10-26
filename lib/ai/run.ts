import { estimateCostMicroUsd, type TokenUsage } from "./prices";

/**
 * Provider-independent core of every metered AI call. All side effects
 * (generation, allowance, logging) are injected, so this file runs in unit
 * tests with a fake generator and never reaches a real AI service.
 *
 * Rules:
 * - One allowance is reserved before generating and given back at most once,
 *   on any failure (API error, timeout, abort, unparseable response).
 * - Only retryable API errors (rate limits, 5xx) are retried, up to
 *   `maxRetries` times. Timeouts, aborts and parse failures are never retried,
 *   because the provider may already have billed for them.
 * - Every attempt that ends the call is recorded with token counts from the
 *   provider, an estimated cost and a status. Prompt and response text are
 *   never recorded.
 */

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
};

export type GenerateRequest = {
  model: string;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
  abortSignal?: AbortSignal;
};

/**
 * Reasoning effort per model. GPT-5 models reason by default and count those
 * tokens against maxOutputTokens, which can leave the answer empty; our short,
 * structured prompts need only minimal reasoning. Other models: provider default.
 */
export function reasoningFor(model: string): "minimal" | undefined {
  return model.startsWith("openai/gpt-5") ? "minimal" : undefined;
}

export type GenerateFn = (req: GenerateRequest) => Promise<{ text: string; usage?: ProviderUsage }>;

export type AiCallStatus = "ok" | "error" | "timeout" | "parse_failed";

/** What gets logged: no prompt, no response, no user text. */
export type AiCallRecord = TokenUsage & {
  feature: string;
  model: string;
  status: AiCallStatus;
  errorKind: string | null;
  costMicroUsd: number | null;
  attempts: number;
  priceVersion: string | null;
};

export type AiDeps = {
  generate: GenerateFn;
  /** Reserves one use of the allowance; false when it is used up. */
  reserve: () => Promise<boolean>;
  /** Gives the reserved use back. Called at most once per call. */
  release: () => Promise<void>;
  record: (r: AiCallRecord) => Promise<void>;
  priceVersion?: string;
  sleep?: (ms: number) => Promise<void>;
};

export type AiRequest<T> = {
  feature: string;
  model: string;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  /** Turns the raw text into the feature's result; null = unusable response. */
  parse: (text: string) => T | null;
  timeoutMs?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
};

export type AiFailureReason = "limit" | "error" | "timeout" | "aborted" | "parse_failed";

export type AiOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: "limit_ai" | "ai_unavailable"; reason: AiFailureReason };

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 1;

export function usageFrom(u: ProviderUsage | undefined): TokenUsage {
  return {
    inputTokens: u?.inputTokens ?? null,
    outputTokens: u?.outputTokens ?? null,
    cacheReadTokens: u?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWriteTokens: u?.inputTokenDetails?.cacheWriteTokens ?? null,
  };
}

const NO_USAGE: TokenUsage = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null };

/** Classifies a thrown error without reading its message (which may echo the prompt). */
export function classifyError(err: unknown, signal?: AbortSignal): { status: AiCallStatus; reason: AiFailureReason; kind: string; retryable: boolean } {
  if (signal?.aborted) return { status: "error", reason: "aborted", kind: "aborted", retryable: false };
  const e = err as { name?: unknown; isRetryable?: unknown; statusCode?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  if (/timeout|abort/i.test(name)) return { status: "timeout", reason: "timeout", kind: "timeout", retryable: false };
  const code = typeof e?.statusCode === "number" ? e.statusCode : null;
  return { status: "error", reason: "error", kind: code ? `http_${code}` : name ? name.slice(0, 60) : "unknown", retryable: e?.isRetryable === true };
}

export async function runAiCall<T>(req: AiRequest<T>, deps: AiDeps): Promise<AiOutcome<T>> {
  if (!(await deps.reserve())) return { ok: false, error: "limit_ai", reason: "limit" };

  let released = false;
  const releaseOnce = async () => {
    if (released) return;
    released = true;
    try {
      await deps.release();
    } catch {
      // A failed refund must not turn into a second attempt; the counter stays as is.
    }
  };
  const base = { feature: req.feature, model: req.model, priceVersion: deps.priceVersion ?? null };
  const record = async (r: Omit<AiCallRecord, "feature" | "model" | "priceVersion">) => {
    try {
      await deps.record({ ...base, ...r });
    } catch {
      // Cost logging never breaks the user's request.
    }
  };

  const maxRetries = Math.max(0, req.maxRetries ?? DEFAULT_MAX_RETRIES);
  const sleep = deps.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  let attempts = 0;

  for (;;) {
    attempts++;
    let res: { text: string; usage?: ProviderUsage };
    try {
      res = await deps.generate({
        model: req.model,
        instructions: req.instructions,
        prompt: req.prompt,
        maxOutputTokens: req.maxOutputTokens,
        timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        abortSignal: req.abortSignal,
      });
    } catch (err) {
      const c = classifyError(err, req.abortSignal);
      if (c.retryable && attempts <= maxRetries) {
        await sleep(400 * attempts);
        continue;
      }
      // Failed API calls report no usage; tokens and cost stay unknown rather than zero.
      await record({ ...NO_USAGE, status: c.status, errorKind: c.kind, costMicroUsd: null, attempts });
      await releaseOnce();
      return { ok: false, error: "ai_unavailable", reason: c.reason };
    }

    const usage = usageFrom(res.usage);
    const costMicroUsd = estimateCostMicroUsd(req.model, usage);
    let value: T | null = null;
    try {
      value = req.parse(res.text);
    } catch {
      value = null;
    }
    if (value === null) {
      // The tokens were spent, so the cost is recorded; the user's allowance is given back. No paid retry.
      await record({ ...usage, status: "parse_failed", errorKind: "parse", costMicroUsd, attempts });
      await releaseOnce();
      return { ok: false, error: "ai_unavailable", reason: "parse_failed" };
    }
    await record({ ...usage, status: "ok", errorKind: null, costMicroUsd, attempts });
    return { ok: true, value };
  }
}

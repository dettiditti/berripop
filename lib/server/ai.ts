import "server-only";
import { generateText } from "ai";
import { getDb } from "../db";
import { aiCalls } from "../db/schema";
import { DEFAULT_AI_MODEL } from "../billing/plans";
import { CURRENT_PRICE_LIST } from "../ai/prices";
import { reasoningFor, runAiCall, type AiOutcome, type AiRequest, type GenerateFn } from "../ai/run";
import { consumeAiAllowance, refundAiAllowance, type AiBucket } from "./entitlements";

/*
 * The single server-side entry point for AI calls. Credentials stay on the
 * server (AI Gateway via AI_GATEWAY_API_KEY or Vercel OIDC); nothing here is
 * importable from client components.
 */

/** Real generation through the AI Gateway. SDK retries are off; runAiCall decides about retries. */
const gatewayGenerate: GenerateFn = async req => {
  const res = await generateText({
    model: req.model,
    instructions: req.instructions,
    prompt: req.prompt,
    maxOutputTokens: req.maxOutputTokens,
    maxRetries: 0,
    reasoning: reasoningFor(req.model),
    timeout: req.timeoutMs,
    abortSignal: req.abortSignal,
  });
  return { text: res.text, usage: res.usage };
};

let testGenerator: GenerateFn | null = null;

/** Verification scripts can swap in a fake generator; ignored in production. */
export function setAiGeneratorForTesting(fn: GenerateFn | null) {
  if (process.env.NODE_ENV === "production") return;
  testGenerator = fn;
}

/**
 * Whether AI Gateway credentials are available. Locally that's an API key or
 * the pulled VERCEL_OIDC_TOKEN; on Vercel deployments the OIDC token arrives
 * per request in the `x-vercel-oidc-token` header (read by the AI SDK), not
 * as an environment variable, so running on Vercel counts as configured.
 */
export function aiConfigured() {
  return !!(testGenerator || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
}

/** The configured default model (AI_GATEWAY_MODEL overrides it). */
export const defaultAiModel = () => process.env.AI_GATEWAY_MODEL || DEFAULT_AI_MODEL;

/**
 * Runs one AI request against the user's allowance bucket. The allowance is
 * reserved and refunded for the same period, even if the call crosses the
 * weekly reset.
 */
export async function runMeteredAi<T>(userId: string, bucket: AiBucket, req: Omit<AiRequest<T>, "model"> & { model?: string }): Promise<AiOutcome<T>> {
  if (!aiConfigured()) return { ok: false, error: "ai_unavailable", reason: "error" };
  const now = new Date();
  return runAiCall({ ...req, model: req.model ?? defaultAiModel() }, {
    generate: testGenerator ?? gatewayGenerate,
    reserve: () => consumeAiAllowance(userId, now, bucket),
    release: () => refundAiAllowance(userId, now, bucket),
    priceVersion: CURRENT_PRICE_LIST.version,
    record: async r => {
      await getDb().insert(aiCalls).values({
        userId,
        feature: r.feature,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        costMicroUsd: r.costMicroUsd,
        priceVersion: r.priceVersion,
        status: r.status,
        errorKind: r.errorKind,
        attempts: r.attempts,
      });
    },
  });
}

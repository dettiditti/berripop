import "server-only";
import { generateText } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiCalls } from "../db/schema";
import { AI_ALLOWANCE_TIME_ZONE, DEFAULT_AI_MODEL } from "../billing/plans";
import type { Reservation } from "../billing/quota";
import { CURRENT_PRICE_LIST } from "../ai/prices";
import { reasoningFor, runAiCall, type AiOutcome, type AiRequest, type GenerateFn } from "../ai/run";
import { getUserEntitlements, releaseQuota, reserveAi, settleQuota, type AiBucket } from "./entitlements";
import { track } from "./analytics";
import { aiAllowedFor } from "./legal";
import { profileInstructionFor } from "./profile";
import { HUNGARIAN_STYLE } from "../ai/style";

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

const TRACK_CONTEXT: Record<AiBucket, string> = { assist: "ai", journal: "journal", assessment: "assessment" };

/**
 * Runs one AI request against the user's allowance bucket. The use is
 * reserved before the call and given back exactly once if the call fails.
 *
 * `idempotencyKey` names the operation (e.g. a reflection on one entry): while
 * it runs, the same operation again is refused as "duplicate" instead of being
 * charged and sent twice. Once it has finished the key is free again.
 */
export async function runMeteredAi<T>(userId: string, bucket: AiBucket, req: Omit<AiRequest<T>, "model"> & { model?: string; idempotencyKey?: string }): Promise<AiOutcome<T>> {
  const now = new Date();
  let held: Reservation | null = null;
  const { idempotencyKey, ...rest } = req;
  const out = await runSlottedAi(userId, rest, {
    reserve: async () => {
      const r = await reserveAi(userId, bucket, { idempotencyKey, now });
      if (r.ok) held = r.reservation;
      return r.ok ? true : r.reason === "duplicate" ? "duplicate" : false;
    },
    release: async () => { if (held) await releaseQuota(userId, held); },
    commit: async () => { if (held) await settleQuota(userId, held); },
  });
  if (!out.ok && out.reason === "limit") {
    const ent = await getUserEntitlements(userId);
    if (ent.tier === "free") await track(userId, "free_quota_exhausted", { context: TRACK_CONTEXT[bucket] });
  }
  return out;
}

/** Estimated AI cost of the member's calls this calendar month (Budapest), in micro-USD. */
export async function monthlyAiCost(userId: string): Promise<number> {
  try {
    const res = await getDb().execute(sql`
      select coalesce(sum(cost_micro_usd), 0)::bigint as total from ai_calls
      where user_id = ${userId}
        and created_at >= (date_trunc('month', now() at time zone ${AI_ALLOWANCE_TIME_ZONE}) at time zone ${AI_ALLOWANCE_TIME_ZONE})`);
    return Number((res.rows[0] as { total?: unknown } | undefined)?.total ?? 0);
  } catch {
    // The safety net never takes AI down; the allowances still apply.
    return 0;
  }
}

/**
 * Same as runMeteredAi, but the caller supplies the allowance (e.g. a per-session
 * turn cap). Configuration and consent are checked the same way.
 */
export async function runSlottedAi<T>(
  userId: string,
  req: Omit<AiRequest<T>, "model"> & { model?: string },
  slot: { reserve: () => Promise<boolean | "duplicate">; release: () => Promise<void>; commit?: () => Promise<void> },
): Promise<AiOutcome<T>> {
  if (!aiConfigured()) return { ok: false, error: "ai_unavailable", reason: "error" };
  // Nothing reaches the AI provider without the member's current consent (when required).
  if (!(await aiAllowedFor(userId))) return { ok: false, error: "ai_consent_required", reason: "error" };
  // Safety net above every allowance: an anomaly (a bug, a price change) can't run up costs.
  const cap = (await getUserEntitlements(userId)).limits.aiMonthlyCostCapMicroUsd;
  if ((await monthlyAiCost(userId)) >= cap) {
    await track(userId, "ai_cost_cap_reached");
    return { ok: false, error: "limit_ai", reason: "cost_cap" };
  }
  // The member's optional age range and gender, only to fit tone and examples (lib/profile/model).
  const about = await profileInstructionFor(userId);
  // Natural Hungarian, never word-for-word translations (lib/ai/style).
  const instructions = [req.instructions, about, HUNGARIAN_STYLE].filter(Boolean).join(" ");
  return runAiCall({ ...req, instructions, model: req.model ?? defaultAiModel() }, {
    generate: testGenerator ?? gatewayGenerate,
    reserve: slot.reserve,
    release: slot.release,
    commit: slot.commit,
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

import { describe, expect, it } from "vitest";
import { DEFAULT_AI_MODEL } from "../lib/billing/plans";
import { CURRENT_PRICE_LIST, estimateCostMicroUsd, type PriceList } from "../lib/ai/prices";
import { classifyError, reasoningFor, runAiCall, type AiCallRecord, type AiDeps, type GenerateFn, type GenerateRequest } from "../lib/ai/run";

const HAIKU = "anthropic/claude-haiku-5.5";

/** A fake world: allowance counter, recorded calls, generator calls. No real AI or database. */
function world(generate: GenerateFn, limit = 5) {
  const state = { used: 0, releases: 0, records: [] as AiCallRecord[], requests: [] as GenerateRequest[] };
  const deps: AiDeps = {
    generate: async req => { state.requests.push(req); return generate(req); },
    reserve: async () => (state.used < limit ? (state.used++, true) : false),
    release: async () => { state.releases++; state.used = Math.max(0, state.used - 1); },
    record: async r => { state.records.push(r); },
    priceVersion: CURRENT_PRICE_LIST.version,
    sleep: async () => {},
  };
  return { state, deps };
}

const req = <T,>(parse: (t: string) => T | null) => ({ feature: "test", model: HAIKU, instructions: "secret instructions", prompt: "private user text", maxOutputTokens: 100, parse });
const apiError = (statusCode: number, isRetryable: boolean) => Object.assign(new Error("provider said: private user text"), { name: "AI_APICallError", statusCode, isRetryable });

describe("cost estimation", () => {
  it("prices input and output from the versioned list (micro-USD, rounded up)", () => {
    // 1000 × 0.10 + 200 × 0.50 = 200 micro-USD
    expect(estimateCostMicroUsd(HAIKU, { inputTokens: 1000, outputTokens: 200, cacheReadTokens: null, cacheWriteTokens: null })).toBe(200);
    // 3 × 0.10 + 1 × 0.50 = 0.8 → rounds up to 1
    expect(estimateCostMicroUsd(HAIKU, { inputTokens: 3, outputTokens: 1, cacheReadTokens: null, cacheWriteTokens: null })).toBe(1);
  });

  it("prices cached input tokens separately", () => {
    // 600 uncached × 0.10 + 400 cache-read × 0.01 + 100 out × 0.50 = 60 + 4 + 50
    expect(estimateCostMicroUsd(HAIKU, { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400, cacheWriteTokens: 0 })).toBe(114);
  });

  it("returns unknown (null), never zero, for unlisted models or missing tokens", () => {
    expect(estimateCostMicroUsd("someone/unknown-model", { inputTokens: 1000, outputTokens: 100, cacheReadTokens: null, cacheWriteTokens: null })).toBeNull();
    expect(estimateCostMicroUsd(HAIKU, { inputTokens: null, outputTokens: 100, cacheReadTokens: null, cacheWriteTokens: null })).toBeNull();
    const noCachePrice: PriceList = { version: "t", source: "t", models: { m: { input: 1, output: 1 } } };
    expect(estimateCostMicroUsd("m", { inputTokens: 10, outputTokens: 1, cacheReadTokens: 5, cacheWriteTokens: null }, noCachePrice)).toBeNull();
  });

  it("lists the current default model, so its cost is never unknown", () => {
    expect(CURRENT_PRICE_LIST.models[DEFAULT_AI_MODEL]).toBeDefined();
    // gpt-5-mini: 1000 in × 0.25 + 200 out × 2 = 650 micro-USD
    expect(estimateCostMicroUsd("openai/gpt-5-mini", { inputTokens: 1000, outputTokens: 200, cacheReadTokens: null, cacheWriteTokens: null })).toBe(650);
  });

  it("uses minimal reasoning for GPT-5 models only", () => {
    expect(reasoningFor("openai/gpt-5-mini")).toBe("minimal");
    expect(reasoningFor("openai/gpt-5-nano")).toBe("minimal");
    expect(reasoningFor(HAIKU)).toBeUndefined();
  });
});

describe("runAiCall with a fake generator", () => {
  it("returns the parsed value and records provider token counts and cost", async () => {
    const { state, deps } = world(async () => ({ text: " Hello ", usage: { inputTokens: 1000, outputTokens: 200, inputTokenDetails: { cacheReadTokens: 0 } } }));
    const out = await runAiCall(req(t => t.trim() || null), deps);
    expect(out).toEqual({ ok: true, value: "Hello" });
    expect(state.used).toBe(1);
    expect(state.records).toEqual([expect.objectContaining({ status: "ok", inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, costMicroUsd: 200, attempts: 1, priceVersion: CURRENT_PRICE_LIST.version })]);
    expect(state.requests[0]).toMatchObject({ model: HAIKU, maxOutputTokens: 100, timeoutMs: 30_000 });
  });

  it("records cached tokens when the provider reports them", async () => {
    const { state, deps } = world(async () => ({ text: "ok", usage: { inputTokens: 1000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 400, cacheWriteTokens: 0 } } }));
    await runAiCall(req(t => t), deps);
    expect(state.records[0]).toMatchObject({ cacheReadTokens: 400, cacheWriteTokens: 0, costMicroUsd: 114 });
  });

  it("keeps tokens unknown (null) when the provider reports none", async () => {
    const { state, deps } = world(async () => ({ text: "ok" }));
    await runAiCall(req(t => t), deps);
    expect(state.records[0]).toMatchObject({ inputTokens: null, outputTokens: null, costMicroUsd: null });
  });

  it("never records prompt, instructions or response text", async () => {
    const { state, deps } = world(async () => ({ text: "private model answer", usage: { inputTokens: 1, outputTokens: 1 } }));
    await runAiCall(req(() => null), deps);
    await runAiCall(req(t => t), deps);
    const failing = world(async () => { throw apiError(500, false); });
    await runAiCall(req(t => t), failing.deps);
    const logged = JSON.stringify([...state.records, ...failing.state.records]);
    expect(logged).not.toMatch(/private|secret/);
  });

  it("does not generate and does not refund when the allowance is used up", async () => {
    const { state, deps } = world(async () => ({ text: "x" }), 0);
    const out = await runAiCall(req(t => t), deps);
    expect(out).toEqual({ ok: false, error: "limit_ai", reason: "limit" });
    expect(state.requests).toHaveLength(0);
    expect(state.releases).toBe(0);
    expect(state.records).toHaveLength(0);
  });

  it("API error: refunds exactly once and records an error with unknown cost", async () => {
    const { state, deps } = world(async () => { throw apiError(400, false); });
    const out = await runAiCall(req(t => t), deps);
    expect(out).toEqual({ ok: false, error: "ai_unavailable", reason: "error" });
    expect(state.releases).toBe(1);
    expect(state.used).toBe(0);
    expect(state.records).toEqual([expect.objectContaining({ status: "error", errorKind: "http_400", costMicroUsd: null, attempts: 1 })]);
  });

  it("retries a retryable API error once (default) and then succeeds", async () => {
    let n = 0;
    const { state, deps } = world(async () => { if (n++ === 0) throw apiError(503, true); return { text: "fine", usage: { inputTokens: 10, outputTokens: 10 } }; });
    const out = await runAiCall(req(t => t), deps);
    expect(out.ok).toBe(true);
    expect(state.requests).toHaveLength(2);
    expect(state.releases).toBe(0);
    expect(state.records).toEqual([expect.objectContaining({ status: "ok", attempts: 2 })]);
  });

  it("stops after maxRetries for persistent retryable errors", async () => {
    const { state, deps } = world(async () => { throw apiError(429, true); });
    const out = await runAiCall({ ...req(t => t), maxRetries: 2 }, deps);
    expect(out.ok).toBe(false);
    expect(state.requests).toHaveLength(3);
    expect(state.releases).toBe(1);
    expect(state.records[0]).toMatchObject({ status: "error", errorKind: "http_429", attempts: 3 });
  });

  it("timeout: no retry, refunds once, recorded as timeout", async () => {
    const { state, deps } = world(async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); });
    const out = await runAiCall({ ...req(t => t), maxRetries: 3 }, deps);
    expect(out).toEqual({ ok: false, error: "ai_unavailable", reason: "timeout" });
    expect(state.requests).toHaveLength(1);
    expect(state.releases).toBe(1);
    expect(state.records[0]).toMatchObject({ status: "timeout", errorKind: "timeout" });
  });

  it("caller abort is not retried and is refunded", async () => {
    const ctrl = new AbortController();
    const { state, deps } = world(async () => { ctrl.abort(); throw Object.assign(new Error("aborted"), { name: "AbortError" }); });
    const out = await runAiCall({ ...req(t => t), abortSignal: ctrl.signal }, deps);
    expect(out).toMatchObject({ ok: false, reason: "aborted" });
    expect(state.requests).toHaveLength(1);
    expect(state.releases).toBe(1);
  });

  it("parse failure: no paid retry, refunds once, records the spent tokens and cost", async () => {
    const { state, deps } = world(async () => ({ text: "not json", usage: { inputTokens: 1000, outputTokens: 200 } }));
    const out = await runAiCall({ ...req(() => null), maxRetries: 3 }, deps);
    expect(out).toEqual({ ok: false, error: "ai_unavailable", reason: "parse_failed" });
    expect(state.requests).toHaveLength(1);
    expect(state.releases).toBe(1);
    expect(state.records).toEqual([expect.objectContaining({ status: "parse_failed", costMicroUsd: 200, inputTokens: 1000 })]);
  });

  it("a throwing parser counts as a parse failure", async () => {
    const { state, deps } = world(async () => ({ text: "x", usage: { inputTokens: 1, outputTokens: 1 } }));
    const out = await runAiCall(req(() => { throw new Error("bad"); }), deps);
    expect(out).toMatchObject({ ok: false, reason: "parse_failed" });
    expect(state.releases).toBe(1);
  });

  it("a failing refund or log write never causes a second refund or a user-facing error", async () => {
    const { state, deps } = world(async () => { throw apiError(500, false); });
    let releaseCalls = 0;
    const out = await runAiCall(req(t => t), { ...deps, release: async () => { releaseCalls++; throw new Error("db down"); }, record: async () => { throw new Error("db down"); } });
    expect(out).toMatchObject({ ok: false, error: "ai_unavailable" });
    expect(releaseCalls).toBe(1);
    expect(state.requests).toHaveLength(1);
  });

  it("concurrent calls each reserve and refund their own allowance", async () => {
    const { state, deps } = world(async () => { throw apiError(500, false); }, 3);
    const outs = await Promise.all(Array.from({ length: 5 }, () => runAiCall(req(t => t), deps)));
    expect(outs.filter(o => !o.ok && o.reason === "limit")).toHaveLength(2);
    expect(state.releases).toBe(3);
    expect(state.used).toBe(0);
  });
});

describe("error classification", () => {
  it("never uses the error message (which may echo user text)", () => {
    const c = classifyError(apiError(502, true));
    expect(c).toEqual({ status: "error", reason: "error", kind: "http_502", retryable: true });
    expect(classifyError(new Error("private text")).kind).toBe("Error");
    expect(classifyError(null).kind).toBe("unknown");
  });
});

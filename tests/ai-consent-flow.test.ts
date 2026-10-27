import { beforeEach, describe, expect, it, vi } from "vitest";
import { consentRefused, runWithAiConsent, type AiConsentGate } from "../lib/legal/aiConsentFlow";
import { LEGAL_VERSIONS } from "../lib/legal/records";

/*
 * Contextual AI consent: the client flow (ask at first use, resume once) and
 * the server side it relies on (records, withdrawal, refusal before any AI
 * request). legal_records is an in-memory stand-in; nothing reaches Neon or
 * an AI provider.
 */

type Row = { userId: string; kind: string; version: string; granted: boolean; createdAt: Date };
const rows: Row[] = [];
let failWrites = false;

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [...rows].reverse() }) }) }),
    insert: () => ({
      values: async (v: Omit<Row, "createdAt">) => {
        if (failWrites) throw new Error("db down");
        rows.push({ ...v, createdAt: new Date(Date.now() + rows.length) });
      },
    }),
  }),
}));
const consumed = vi.fn(async () => true);
vi.mock("../lib/server/entitlements", () => ({ consumeAiAllowance: consumed, refundAiAllowance: vi.fn() }));

const legal = await import("../lib/server/legal");
const { runMeteredAi, setAiGeneratorForTesting } = await import("../lib/server/ai");

const refusal = { ok: false as const, error: "ai_consent_required" as const };
const success = { ok: true as const };

/** A gate whose dialog answers `answers` in order (true: the server recorded consent). */
function gate(allowed: boolean, answers: boolean[] = []) {
  let ok = allowed;
  const log: string[] = [];
  const g: AiConsentGate = {
    allowed: () => ok,
    ask: async () => {
      log.push("ask");
      const a = answers.shift() ?? false;
      if (a) ok = true;
      return a;
    },
    invalidate: () => {
      log.push("invalidate");
      ok = false;
    },
  };
  return { g, log };
}

beforeEach(() => {
  rows.length = 0;
  failWrites = false;
  consumed.mockClear();
});

describe("client flow", () => {
  it("first use: asks, and sends the request only after consent, exactly once", async () => {
    const { g, log } = gate(false, [true]);
    const call = vi.fn(async () => { log.push("call"); return success; });
    expect(await runWithAiConsent(g, call, consentRefused)).toBe(success);
    expect(log).toEqual(["ask", "call"]);
  });

  it("already consented: no dialog, one request", async () => {
    const { g, log } = gate(true);
    const call = vi.fn(async () => success);
    expect(await runWithAiConsent(g, call, consentRefused)).toBe(success);
    expect(call).toHaveBeenCalledTimes(1);
    expect(log).toEqual([]);
  });

  it("declined, cancelled or not saved: no request is sent", async () => {
    const { g } = gate(false, [false]);
    const call = vi.fn(async () => success);
    expect(await runWithAiConsent(g, call, consentRefused)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("withdrawn elsewhere: the server's refusal reopens the dialog, then resumes once", async () => {
    const { g, log } = gate(true, [true]);
    const call = vi.fn().mockResolvedValueOnce(refusal).mockResolvedValueOnce(success);
    expect(await runWithAiConsent(g, call, consentRefused)).toBe(success);
    expect(call).toHaveBeenCalledTimes(2);
    expect(log).toEqual(["invalidate", "ask"]);
  });

  it("withdrawn elsewhere and declined: stops after the refused attempt", async () => {
    const { g } = gate(true, [false]);
    const call = vi.fn(async () => refusal);
    expect(await runWithAiConsent(g, call, consentRefused)).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("recognises only the consent refusal", () => {
    expect(consentRefused(refusal)).toBe(true);
    expect(consentRefused({ ok: false, error: "limit_ai" })).toBe(false);
    expect(consentRefused(success)).toBe(false);
    expect(consentRefused(null)).toBe(false);
  });
});

describe("server side", () => {
  it("records the consent version with a timestamp, and does not repeat it", async () => {
    expect(await legal.aiAllowedFor("u")).toBe(false);
    expect(await legal.setAiConsent("u", true, LEGAL_VERSIONS.aiConsent)).toEqual({ ok: true });
    expect(await legal.setAiConsent("u", true, LEGAL_VERSIONS.aiConsent)).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u", kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted: true });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(await legal.aiAllowedFor("u")).toBe(true);
  });

  it("a stale notice version or a failed write records nothing and allows nothing", async () => {
    expect(await legal.setAiConsent("u", true, "2020-01-01")).toEqual({ ok: false, error: "outdated" });
    failWrites = true;
    await expect(legal.setAiConsent("u", true, LEGAL_VERSIONS.aiConsent)).rejects.toThrow();
    expect(rows).toHaveLength(0);
    expect(await legal.aiAllowedFor("u")).toBe(false);
  });

  it("withdrawal stops AI processing", async () => {
    await legal.setAiConsent("u", true, LEGAL_VERSIONS.aiConsent);
    await legal.setAiConsent("u", false, LEGAL_VERSIONS.aiConsent);
    expect((await legal.getLegalStatus("u")).aiConsent).toBe("withdrawn");
    expect(await legal.aiAllowedFor("u")).toBe(false);
  });

  it("refuses before the AI request or the allowance when consent is missing", async () => {
    const generate = vi.fn();
    setAiGeneratorForTesting(generate);
    try {
      const out = await runMeteredAi("u", "assist", { feature: "t", instructions: "", prompt: "secret journal text", maxOutputTokens: 10, parse: t => t });
      expect(out).toMatchObject({ ok: false, error: "ai_consent_required" });
      expect(generate).not.toHaveBeenCalled();
      expect(consumed).not.toHaveBeenCalled();
    } finally {
      setAiGeneratorForTesting(null);
    }
  });
});

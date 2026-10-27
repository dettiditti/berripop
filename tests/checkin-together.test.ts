import { beforeEach, describe, expect, it, vi } from "vitest";
import { dailyCheckins, growthGoals } from "../lib/db/schema";
import { parseCheckinReply } from "../lib/checkin/checkin";

/*
 * "Think it through together": an AI request the member starts, with only
 * today's check-in and goal titles as context, behind AI consent and the
 * weekly journal allowance. In-memory stand-ins; nothing reaches Neon or an
 * AI provider.
 */

const checkin = { id: "c1", userId: "u", date: "2026-10-27", state: "tense", topics: ["work"], note: "Holnap prezentálok, és félek, hogy elrontom.", need: "practical", aiReply: null as unknown, createdAt: new Date(), updatedAt: new Date() };
let hasCheckin = true;
let consent = true;
const updates: Record<string, unknown>[] = [];
const allowance = vi.fn(async () => true);

function chain(rows: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const k of ["where", "orderBy", "limit"]) c[k] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej);
  return c;
}

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: (t: unknown) => chain(() => (t === dailyCheckins ? (hasCheckin ? [checkin] : []) : t === growthGoals ? [{ title: "Magabiztosabb fellépés" }] : [])) }),
    update: (t: unknown) => ({ set: (v: Record<string, unknown>) => ({ where: async () => { if (t === dailyCheckins) updates.push(v); } }) }),
    insert: () => ({ values: async () => {} }),
  }),
}));
vi.mock("../lib/server/legal", () => ({ aiAllowedFor: async () => consent }));
vi.mock("../lib/server/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/server/snapshot", () => ({ loadSnapshot: async () => ({ progress: {} }) }));
vi.mock("../lib/server/entitlements", () => ({ consumeAiAllowance: allowance, refundAiAllowance: async () => {} }));

const { thinkTogether } = await import("../lib/server/checkin");
const { setAiGeneratorForTesting } = await import("../lib/server/ai");

const reply = { heard: "Azt írtad, holnap prezentálsz, és tartasz tőle.", question: "Mi segítene ma este egy kicsit megnyugodni?", idea: "Mondd el egyszer hangosan az első két mondatot.", safety: false };
let sent: { instructions: string; prompt: string } | null = null;

beforeEach(() => {
  hasCheckin = true;
  consent = true;
  updates.length = 0;
  sent = null;
  allowance.mockClear();
  setAiGeneratorForTesting(async req => {
    sent = { instructions: req.instructions, prompt: req.prompt };
    return { text: JSON.stringify(reply) };
  });
});

describe("think it through together", () => {
  it("sends only today's check-in and goal titles, counts against the journal allowance, and stores the reply", async () => {
    const r = await thinkTogether("u", "hu");
    expect(r.ok).toBe(true);
    expect(sent!.prompt).toContain(checkin.note);
    expect(sent!.prompt).toContain("Feszülten");
    expect(sent!.prompt).toContain("Magabiztosabb fellépés");
    expect(sent!.prompt).not.toMatch(/Journal entry|Insights/);
    expect(allowance).toHaveBeenCalledWith("u", expect.any(Date), "journal");
    expect(updates).toEqual([{ aiReply: { heard: reply.heard, question: reply.question, idea: reply.idea } }]);
    if (r.ok) expect(r.data?.safety).toBe(false);
  });

  it("sends nothing without consent", async () => {
    consent = false;
    expect(await thinkTogether("u", "hu")).toEqual({ ok: false, error: "ai_consent_required" });
    expect(sent).toBeNull();
    expect(allowance).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("needs today's check-in first", async () => {
    hasCheckin = false;
    expect(await thinkTogether("u", "hu")).toEqual({ ok: false, error: "not_found" });
    expect(sent).toBeNull();
  });

  it("raises the safety card from the AI flag, without storing the flag", async () => {
    setAiGeneratorForTesting(async () => ({ text: JSON.stringify({ ...reply, idea: null, safety: true }) }));
    const r = await thinkTogether("u", "en");
    expect(r.ok && r.data?.safety).toBe(true);
    expect(updates[0].aiReply).not.toHaveProperty("safety");
  });
});

describe("parsing the reply", () => {
  it("needs what it heard and a question; caps lengths", () => {
    expect(parseCheckinReply(JSON.stringify({ heard: "a" }))).toBeNull();
    expect(parseCheckinReply("not json")).toBeNull();
    const r = parseCheckinReply("```json\n" + JSON.stringify({ heard: "h".repeat(600), question: "q?", idea: "" }) + "\n```")!;
    expect(r.heard).toHaveLength(400);
    expect(r).toMatchObject({ question: "q?", idea: null, safety: false });
  });
});

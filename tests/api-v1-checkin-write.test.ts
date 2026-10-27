import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { dailyCheckins } from "../lib/db/schema";
import { LEGAL_VERSIONS, legalState, type LegalRecordRow } from "../lib/legal/records";

/*
 * PUT and DELETE /api/v1/checkin/today: Bearer-only, the current Terms
 * accepted before any write, the web's check-in rules (cleaning, one row per
 * member per Budapest day) and no AI. The real check-in service runs against
 * an in-memory daily_checkins whose queries are read from the real Drizzle
 * conditions; Clerk and legal records are stand-ins read through the real
 * legal rules. Nothing reaches Clerk or Neon.
 */

const A = "aaa.bbb.ccc";
const B = "ddd.eee.fff";
const C = "ggg.hhh.iii";
const D = "jjj.kkk.lll";
const valid: Record<string, string> = { [A]: "user_a", [B]: "user_b", [C]: "user_c", [D]: "user_d" };

const authenticateRequest = vi.fn(async (req: Request) => {
  const userId = valid[req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
  return userId ? { isAuthenticated: true, toAuth: () => ({ userId }) } : { isAuthenticated: false, toAuth: () => ({ userId: null }) };
});
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ authenticateRequest }) }));

const provisioned: string[] = [];
vi.mock("../lib/server/session", () => ({ ensureUserRow: async (userId: string) => void provisioned.push(userId) }));

// Terms: user_a and user_b accepted the current version, user_c an older one, user_d withdrew.
const at = (iso: string) => new Date(iso);
const legalRows: Record<string, LegalRecordRow[]> = {
  user_a: [{ kind: "terms", version: LEGAL_VERSIONS.terms, granted: true, createdAt: at("2026-10-27T08:00:00Z") }],
  user_b: [{ kind: "terms", version: LEGAL_VERSIONS.terms, granted: true, createdAt: at("2026-10-27T08:00:00Z") }],
  user_c: [
    { kind: "terms", version: "2026-10-27", granted: true, createdAt: at("2026-10-26T08:00:00Z") },
    // AI consent at the current version does not stand in for the Terms.
    { kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted: true, createdAt: at("2026-10-27T08:00:00Z") },
  ],
  user_d: [
    { kind: "terms", version: LEGAL_VERSIONS.terms, granted: true, createdAt: at("2026-10-27T08:00:00Z") },
    { kind: "terms", version: LEGAL_VERSIONS.terms, granted: false, createdAt: at("2026-10-27T09:00:00Z") },
  ],
};
vi.mock("../lib/server/legal", () => ({
  getLegalStatus: async (userId: string) => {
    const rows = legalRows[userId] ?? [];
    return {
      terms: legalState(rows, "terms", LEGAL_VERSIONS.terms),
      termsVersion: LEGAL_VERSIONS.terms,
      aiConsent: legalState(rows, "ai_processing", LEGAL_VERSIONS.aiConsent),
      aiConsentVersion: LEGAL_VERSIONS.aiConsent,
      aiConsentRequired: true,
    };
  },
}));

// daily_checkins in memory. The (user id, date) a query targets is read from its real Drizzle condition.
type Row = typeof dailyCheckins.$inferSelect;
const rows: Row[] = [];
const dialect = new PgDialect();
const target = (cond: SQL) => dialect.sqlToQuery(cond).params as [string, string];
const otherTables: unknown[] = [];
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: unknown) => ({
        where: (cond: SQL) => ({
          limit: async () => {
            if (t !== dailyCheckins) otherTables.push(t);
            const [userId, date] = target(cond);
            return rows.filter(r => r.userId === userId && r.date === date);
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: (v: Partial<Row> & { userId: string; date: string }) => ({
        onConflictDoUpdate: async ({ set }: { set: Partial<Row> }) => {
          if (t !== dailyCheckins) otherTables.push(t);
          const i = rows.findIndex(r => r.userId === v.userId && r.date === v.date);
          const now = new Date();
          if (i >= 0) rows[i] = { ...rows[i], ...set };
          else rows.push({ id: `row-${rows.length + 1}`, state: null, topics: [], note: "", need: null, aiReply: null, createdAt: now, updatedAt: now, ...v } as Row);
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async (cond: SQL) => {
        if (t !== dailyCheckins) otherTables.push(t);
        const [userId, date] = target(cond);
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === userId && rows[i].date === date) rows.splice(i, 1);
      },
    }),
  }),
}));
const aiCalls: unknown[] = [];
vi.mock("../lib/server/ai", () => ({ runMeteredAi: async (...a: unknown[]) => { aiCalls.push(a); throw new Error("no AI here"); } }));
vi.mock("../lib/server/analytics", () => ({ track: async () => {} }));
vi.mock("../lib/server/snapshot", () => ({ loadSnapshot: async () => { throw new Error("the API never loads the web snapshot"); } }));

const { GET, PUT, DELETE } = await import("../app/api/v1/checkin/today/route");

const URL = "https://www.berripop.com/api/v1/checkin/today";
const put = (token: string | null, body: unknown, extra: Record<string, string> = {}, url = URL) =>
  PUT(new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const del = (token: string | null, extra: Record<string, string> = {}, url = URL) =>
  DELETE(new Request(url, { method: "DELETE", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } }));
const get = (token: string) => GET(new Request(URL, { headers: { authorization: `Bearer ${token}` } }));

const seed = (userId: string, date: string, patch: Partial<Row> = {}) =>
  rows.push({ id: `seed-${rows.length}`, userId, date, state: "sad", topics: ["family"], note: "theirs", need: "listen", aiReply: { heard: "h", question: "q?", idea: null }, createdAt: new Date(), updatedAt: new Date(), ...patch });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 12:00 in Budapest on 27 October 2026 (CET, UTC+1 after the clocks went back on the 25th).
  vi.setSystemTime(new Date("2026-10-27T11:00:00Z"));
  rows.length = provisioned.length = otherTables.length = aiCalls.length = 0;
  authenticateRequest.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("PUT: saving", () => {
  it("saves today's check-in with the web's cleaning and returns it", async () => {
    const r = await put(A, { state: "tired", topics: ["work", "work", "bogus", "family", "money", "health"], note: `  ${"a".repeat(600)} `, need: "listen" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.date).toBe("2026-10-27");
    expect(body.checkin).toMatchObject({ date: "2026-10-27", state: "tired", topics: ["work", "family", "money"], note: "a".repeat(500), need: "listen", aiReply: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "user_a", date: "2026-10-27" });
  });

  it("one row per member per day: saving again replaces it and drops the AI follow-up", async () => {
    await put(A, { state: "tense" });
    rows[0].aiReply = { heard: "x", question: "y?", idea: null };
    const body = await (await put(A, { state: "calm", need: "note" })).json();
    expect(rows).toHaveLength(1);
    expect(body.checkin).toMatchObject({ state: "calm", topics: [], note: "", need: "note", aiReply: null });
  });

  it("every step is optional, as on the web", async () => {
    expect((await put(A, { note: "just this" })).status).toBe(200);
    expect((await put(A, { topics: ["self"] })).status).toBe(200);
    expect(rows[0]).toMatchObject({ state: null, topics: ["self"], note: "", need: null });
  });

  it("creates the member's user row first (it is referenced by the check-in)", async () => {
    await put(A, { state: "good" });
    expect(provisioned).toEqual(["user_a"]);
  });

  it("never calls AI, never loads the web snapshot, never writes another table", async () => {
    await put(A, { state: "good", note: "I don't want to be here anymore" });
    expect(aiCalls).toEqual([]);
    expect(otherTables).toEqual([]);
  });

  it("private, never cached", async () => {
    const r = await put(A, { state: "good" });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
  });
});

describe("PUT: invalid input", () => {
  it.each([
    ["nothing given", {}],
    ["only unknown values", { state: "ecstatic", topics: "work", note: "   ", need: 3 }],
    ["an array", [{ state: "good" }]],
    ["a JSON string", "\"good\""],
    ["null", "null"],
    ["not JSON", "state=good"],
    ["an empty body", ""],
    ["an oversized body", JSON.stringify({ state: "good", note: "x".repeat(9000) })],
  ])("400 for %s, with no details and nothing written", async (_, body) => {
    const r = await put(A, body);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe(JSON.stringify({ error: "invalid" }));
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(rows).toEqual([]);
  });

  it("an invalid save leaves an existing check-in untouched", async () => {
    seed("user_a", "2026-10-27");
    await put(A, { state: "nope" });
    expect(rows[0]).toMatchObject({ state: "sad", note: "theirs" });
  });
});

describe("Budapest days", () => {
  it("23:30 in Budapest still saves to that day; 00:30 the next one starts a new row", async () => {
    vi.setSystemTime(new Date("2026-10-27T22:30:00Z"));
    expect((await (await put(A, { state: "tired" })).json()).date).toBe("2026-10-27");
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    expect((await (await put(A, { state: "calm" })).json()).date).toBe("2026-10-28");
    expect(rows.map(r => [r.date, r.state])).toEqual([["2026-10-27", "tired"], ["2026-10-28", "calm"]]);
  });

  it("uses the summer offset before the clocks change (UTC+2)", async () => {
    vi.setSystemTime(new Date("2026-10-24T22:30:00Z")); // 00:30 on the 25th in Budapest
    expect((await (await put(A, { state: "good" })).json()).date).toBe("2026-10-25");
  });

  it("a client-supplied date is ignored", async () => {
    const body = await (await put(A, { state: "good", date: "2026-10-01" }, {}, `${URL}?date=2026-10-01`)).json();
    expect(body.date).toBe("2026-10-27");
    expect(rows[0].date).toBe("2026-10-27");
  });

  it("DELETE removes only today's row, never yesterday's", async () => {
    seed("user_a", "2026-10-26");
    seed("user_a", "2026-10-27");
    expect((await del(A)).status).toBe(204);
    expect(rows.map(r => r.date)).toEqual(["2026-10-26"]);
  });

  it("after midnight, today has no check-in until a new one is saved", async () => {
    await put(A, { state: "good" });
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    expect((await (await get(A)).json())).toEqual({ date: "2026-10-28", checkin: null });
  });
});

describe("DELETE: removing", () => {
  it("204 with no body and private headers; deleting again is still 204", async () => {
    seed("user_a", "2026-10-27");
    const r = await del(A);
    expect(r.status).toBe(204);
    expect(await r.text()).toBe("");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(rows).toEqual([]);
    expect((await del(A)).status).toBe(204);
  });

  it("does not create a user row", async () => {
    await del(A);
    expect(provisioned).toEqual([]);
  });
});

describe("Terms acceptance before writing", () => {
  it.each([
    ["missing", "user_none", "zzz.none.zzz"],
    ["outdated (and AI consent does not count)", "user_c", C],
    ["withdrawn", "user_d", D],
  ])("%s Terms: 403 terms_required, nothing saved", async (_, userId, token) => {
    valid[token] = userId;
    const r = await put(token, { state: "good" });
    expect(r.status).toBe(403);
    expect(await r.text()).toBe(JSON.stringify({ error: "terms_required" }));
    expect(rows).toEqual([]);
  });

  it.each([["outdated", "user_c", C], ["withdrawn", "user_d", D]])("%s Terms: DELETE is refused and the row stays", async (_, userId, token) => {
    seed(userId, "2026-10-27");
    const r = await del(token);
    expect(r.status).toBe(403);
    expect(rows).toHaveLength(1);
  });

  it("reading today's check-in does not need the Terms", async () => {
    seed("user_c", "2026-10-27");
    expect((await get(C)).status).toBe(200);
  });
});

describe("authentication", () => {
  it.each([null, "not-a-jwt", "zzz.zzz.zzz"])("401 for PUT and DELETE with token %s, nothing changes", async token => {
    seed("user_a", "2026-10-27");
    const p = await put(token, { state: "good" });
    const d = await del(token);
    expect([p.status, d.status]).toEqual([401, 401]);
    expect(await p.json()).toEqual({ error: "unauthorized" });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("sad");
  });

  it("a browser session cookie alone never authenticates a write", async () => {
    const p = await put(null, { state: "good" }, { cookie: `__session=${A}` });
    const d = await del(null, { cookie: `__session=${A}` });
    expect([p.status, d.status]).toEqual([401, 401]);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });
});

describe("isolation between members", () => {
  it("saving writes only the token owner's row; another member's is untouched", async () => {
    seed("user_b", "2026-10-27");
    await put(A, { state: "good" }, { "x-user-id": "user_b" }, `${URL}?userId=user_b`);
    expect(rows.find(r => r.userId === "user_b")).toMatchObject({ state: "sad", note: "theirs" });
    expect(rows.find(r => r.userId === "user_a")).toMatchObject({ state: "good" });
  });

  it("a userId in the body is ignored", async () => {
    await put(A, { state: "good", userId: "user_b" });
    expect(rows.map(r => r.userId)).toEqual(["user_a"]);
  });

  it("deleting removes only the token owner's row", async () => {
    seed("user_a", "2026-10-27");
    seed("user_b", "2026-10-27");
    await del(B, { "x-user-id": "user_a" }, `${URL}?userId=user_a`);
    expect(rows.map(r => r.userId)).toEqual(["user_a"]);
  });

  it("the response never contains another member's check-in", async () => {
    seed("user_b", "2026-10-27", { note: "b's private note" });
    const text = await (await put(A, { state: "calm" })).text();
    expect(text).not.toContain("b's private note");
    expect(text).not.toContain("user_b");
  });
});

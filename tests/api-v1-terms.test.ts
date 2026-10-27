import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { dailyCheckins, legalRecords } from "../lib/db/schema";
import { entitlementsFrom } from "../lib/billing/entitlements";
import { LEGAL_VERSIONS } from "../lib/legal/records";

/*
 * POST /api/v1/legal/terms: the web's acceptTerms rule behind Bearer-only
 * authentication. The real legal service, check-in service and /me route
 * run against in-memory legal_records and daily_checkins whose queries are
 * read from the real Drizzle conditions. Nothing reaches Clerk or Neon.
 */

const A = "aaa.bbb.ccc";
const B = "ddd.eee.fff";
const valid: Record<string, string> = { [A]: "user_a", [B]: "user_b" };
let clerkDown = false;
const authenticateRequest = vi.fn(async (req: Request) => {
  if (clerkDown) throw new Error("jwks fetch failed");
  const userId = valid[req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
  return userId ? { isAuthenticated: true, toAuth: () => ({ userId }) } : { isAuthenticated: false, toAuth: () => ({ userId: null }) };
});
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ authenticateRequest }) }));

const provisioned: string[] = [];
vi.mock("../lib/server/session", () => ({ ensureUserRow: async (userId: string) => void provisioned.push(userId) }));
vi.mock("../lib/server/entitlements", () => ({ getUserEntitlements: async () => entitlementsFrom(null) }));
vi.mock("../lib/server/analytics", () => ({ track: async () => {} }));
vi.mock("../lib/server/snapshot", () => ({ loadSnapshot: async () => ({}) }));

type LegalRow = { userId: string; kind: string; version: string; granted: boolean; createdAt: Date };
const legal: LegalRow[] = [];
const checkins: (typeof dailyCheckins.$inferSelect)[] = [];
let clock = Date.parse("2026-10-27T10:00:00Z");
let failWrites = false;
const dialect = new PgDialect();
const params = (cond: SQL) => dialect.sqlToQuery(cond).params as string[];

vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: unknown) => ({
        where: (cond: SQL) => {
          const [userId, ...rest] = params(cond);
          const legalRows = async () => legal.filter(r => r.userId === userId && rest.includes(r.kind)).sort((a, b) => +b.createdAt - +a.createdAt);
          return {
            orderBy: async () => {
              if (t !== legalRecords) throw new Error("unexpected table");
              return legalRows();
            },
            limit: async () => {
              if (t !== dailyCheckins) throw new Error("unexpected table");
              return checkins.filter(r => r.userId === userId && r.date === rest[0]);
            },
          };
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        // legal_records: awaited directly.
        then: (ok: (x: unknown) => void, bad: (e: unknown) => void) => {
          if (t !== legalRecords) return bad(new Error("unexpected table"));
          if (failWrites) return bad(new Error("db down"));
          legal.push({ ...(v as Omit<LegalRow, "createdAt">), createdAt: new Date((clock += 1000)) });
          ok(undefined);
        },
        // daily_checkins: upsert.
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (t !== dailyCheckins) throw new Error("unexpected table");
          const i = checkins.findIndex(r => r.userId === v.userId && r.date === v.date);
          const now = new Date();
          if (i >= 0) checkins[i] = { ...checkins[i], ...set };
          else checkins.push({ id: "c1", state: null, topics: [], note: "", need: null, aiReply: null, createdAt: now, updatedAt: now, ...v } as unknown as (typeof checkins)[number]);
        },
      }),
    }),
  }),
}));

const { POST } = await import("../app/api/v1/legal/terms/route");
const me = await import("../app/api/v1/me/route");
const checkin = await import("../app/api/v1/checkin/today/route");

const URL = "https://www.berripop.com/api/v1/legal/terms";
const accept = (token: string | null, body: unknown, extra: Record<string, string> = {}, url = URL) =>
  POST(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const getMe = async (token: string) => (await me.GET(new Request("https://www.berripop.com/api/v1/me", { headers: { authorization: `Bearer ${token}` } }))).json();
const putCheckin = (token: string) =>
  checkin.PUT(new Request("https://www.berripop.com/api/v1/checkin/today", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ state: "good" }) }));
const current = { version: LEGAL_VERSIONS.terms };
const grant = (userId: string, kind: string, version: string, granted = true) => legal.push({ userId, kind, version, granted, createdAt: new Date((clock += 1000)) });

beforeEach(() => {
  legal.length = checkins.length = provisioned.length = 0;
  clerkDown = failWrites = false;
  authenticateRequest.mockClear();
});

describe("accepting the current Terms", () => {
  it("records one grant of the current version and answers with the stored state", async () => {
    const r = await accept(A, current);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ terms: "granted", termsVersion: LEGAL_VERSIONS.terms });
    expect(legal).toEqual([expect.objectContaining({ userId: "user_a", kind: "terms", version: LEGAL_VERSIONS.terms, granted: true })]);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
  });

  it("creates the member's user row first (legal records reference it)", async () => {
    await accept(A, current);
    expect(provisioned).toEqual(["user_a"]);
  });

  it("then /me shows the Terms granted and a check-in can be saved", async () => {
    expect((await getMe(A)).legal.terms).toBe("missing");
    expect((await putCheckin(A)).status).toBe(403);
    await accept(A, current);
    expect((await getMe(A)).legal).toMatchObject({ terms: "granted", termsVersion: LEGAL_VERSIONS.terms });
    expect((await putCheckin(A)).status).toBe(200);
    expect(checkins).toHaveLength(1);
  });
});

describe("versions", () => {
  it.each(["2026-10-27", "2020-01-01", "9999-12-31", `${LEGAL_VERSIONS.terms} `, LEGAL_VERSIONS.terms.toUpperCase() + "x"])(
    "409 outdated for version %j, with the current version; nothing recorded",
    async version => {
      const r = await accept(A, { version });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "outdated", termsVersion: LEGAL_VERSIONS.terms });
      expect(legal).toEqual([]);
    },
  );

  it("an outdated acceptance gets a new record at the current version", async () => {
    grant("user_a", "terms", "2026-10-27");
    expect((await getMe(A)).legal.terms).toBe("outdated");
    await accept(A, current);
    expect(legal.map(r => r.version)).toEqual(["2026-10-27", LEGAL_VERSIONS.terms]);
    expect((await getMe(A)).legal.terms).toBe("granted");
  });

  it("a withdrawn acceptance can be given again; the history stays", async () => {
    grant("user_a", "terms", LEGAL_VERSIONS.terms);
    grant("user_a", "terms", LEGAL_VERSIONS.terms, false);
    expect((await getMe(A)).legal.terms).toBe("withdrawn");
    await accept(A, current);
    expect(legal.map(r => r.granted)).toEqual([true, false, true]);
    expect((await getMe(A)).legal.terms).toBe("granted");
  });

  it("offering an old version never touches a current acceptance", async () => {
    grant("user_a", "terms", LEGAL_VERSIONS.terms);
    expect((await accept(A, { version: "2020-01-01" })).status).toBe(409);
    expect(legal).toHaveLength(1);
    expect((await getMe(A)).legal.terms).toBe("granted");
  });
});

describe("accepting again", () => {
  it("is a no-op: still 200, still one record", async () => {
    expect((await accept(A, current)).status).toBe(200);
    expect((await accept(A, current)).status).toBe(200);
    expect(legal).toHaveLength(1);
  });
});

describe("AI consent stays separate", () => {
  it("accepting the Terms records no AI consent", async () => {
    await accept(A, current);
    expect(legal.filter(r => r.kind !== "terms")).toEqual([]);
    expect((await getMe(A)).legal.aiConsent).toBe("missing");
  });

  it("a withdrawn AI consent stays withdrawn, and AI consent never counts as the Terms", async () => {
    grant("user_a", "ai_processing", LEGAL_VERSIONS.aiConsent);
    expect((await getMe(A)).legal.terms).toBe("missing");
    grant("user_a", "ai_processing", LEGAL_VERSIONS.aiConsent, false);
    await accept(A, current);
    expect((await getMe(A)).legal).toMatchObject({ terms: "granted", aiConsent: "withdrawn" });
  });

  it("a body asking for AI consent too is ignored apart from the version", async () => {
    await accept(A, { version: LEGAL_VERSIONS.terms, aiConsent: true, kind: "ai_processing" });
    expect(legal.map(r => r.kind)).toEqual(["terms"]);
  });
});

describe("invalid requests", () => {
  it.each([
    ["no version", {}],
    ["a number", { version: 20261027 }],
    ["an empty string", { version: "" }],
    ["a very long string", { version: "x".repeat(65) }],
    ["an array", [current]],
    ["not JSON", "version=2026"],
    ["an empty body", ""],
  ])("400 for %s, nothing recorded", async (_, body) => {
    const r = await accept(A, body);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe(JSON.stringify({ error: "invalid" }));
    expect(legal).toEqual([]);
  });

  it("a failed write answers 500 without details and unlocks nothing", async () => {
    failWrites = true;
    const r = await accept(A, current);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(JSON.stringify({ error: "internal" }));
    expect((await getMe(A)).legal.terms).toBe("missing");
  });
});

describe("authentication", () => {
  it.each([null, "not-a-jwt", "zzz.zzz.zzz"])("401 for token %s, nothing recorded or created", async token => {
    const r = await accept(token, current);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    expect(legal).toEqual([]);
    expect(provisioned).toEqual([]);
  });

  it("a browser session cookie alone never accepts the Terms", async () => {
    expect((await accept(null, current, { cookie: `__session=${A}` })).status).toBe(401);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("503 when Clerk cannot verify at all", async () => {
    clerkDown = true;
    expect((await accept(A, current)).status).toBe(503);
    expect(legal).toEqual([]);
  });
});

describe("isolation between members", () => {
  it("records only for the token owner, whatever user id the client sends", async () => {
    await accept(A, { ...current, userId: "user_b" }, { "x-user-id": "user_b" }, `${URL}?userId=user_b`);
    expect(legal.map(r => r.userId)).toEqual(["user_a"]);
    expect((await getMe(B)).legal.terms).toBe("missing");
    expect((await putCheckin(B)).status).toBe(403);
  });

  it("another member's acceptance does not count for you", async () => {
    grant("user_b", "terms", LEGAL_VERSIONS.terms);
    expect((await getMe(A)).legal.terms).toBe("missing");
    expect((await putCheckin(A)).status).toBe(403);
  });
});

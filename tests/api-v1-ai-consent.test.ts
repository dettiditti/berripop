import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { legalRecords } from "../lib/db/schema";
import { entitlementsFrom } from "../lib/billing/entitlements";
import { LEGAL_VERSIONS } from "../lib/legal/records";

/*
 * POST /api/v1/legal/ai-consent: the web's setAiConsent rule behind
 * Bearer-only authentication, kept apart from the Terms. The real legal
 * service and /me route run against an in-memory legal_records whose
 * queries are read from the real Drizzle conditions. Nothing reaches Clerk,
 * Neon or an AI provider.
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

type LegalRow = { userId: string; kind: string; version: string; granted: boolean; createdAt: Date };
const legal: LegalRow[] = [];
let clock = Date.parse("2026-10-27T10:00:00Z");
let failWrites = false;
const dialect = new PgDialect();

vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: unknown) => ({
        where: (cond: SQL) => ({
          orderBy: async () => {
            if (t !== legalRecords) throw new Error("unexpected table");
            const [userId, ...kinds] = dialect.sqlToQuery(cond).params as string[];
            return legal.filter(r => r.userId === userId && kinds.includes(r.kind)).sort((a, b) => +b.createdAt - +a.createdAt);
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (v: Omit<LegalRow, "createdAt">) => {
        if (t !== legalRecords) throw new Error("unexpected table");
        if (failWrites) throw new Error("db password=hunter2");
        legal.push({ ...v, createdAt: new Date((clock += 1000)) });
      },
    }),
  }),
}));

const { POST } = await import("../app/api/v1/legal/ai-consent/route");
const me = await import("../app/api/v1/me/route");
const { aiAllowedFor } = await import("../lib/server/legal");

const URL = "https://www.berripop.com/api/v1/legal/ai-consent";
const send = (token: string | null, body: unknown, extra: Record<string, string> = {}, url = URL) =>
  POST(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const getMe = async (token: string) => (await me.GET(new Request("https://www.berripop.com/api/v1/me", { headers: { authorization: `Bearer ${token}` } }))).json();
const give = { granted: true, version: LEGAL_VERSIONS.aiConsent };
const withdraw = { granted: false };
const record = (userId: string, kind: string, version: string, granted = true) => legal.push({ userId, kind, version, granted, createdAt: new Date((clock += 1000)) });

beforeEach(() => {
  legal.length = provisioned.length = 0;
  clerkDown = failWrites = false;
  authenticateRequest.mockClear();
  vi.unstubAllEnvs();
});

describe("giving consent", () => {
  it("records one grant of the current notice and answers with the stored state", async () => {
    const r = await send(A, give);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ aiConsent: "granted", aiConsentVersion: LEGAL_VERSIONS.aiConsent, aiConsentRequired: true });
    expect(legal).toEqual([expect.objectContaining({ userId: "user_a", kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted: true })]);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
    expect(await aiAllowedFor("user_a")).toBe(true);
  });

  it("giving it again records nothing new", async () => {
    await send(A, give);
    expect((await send(A, give)).status).toBe(200);
    expect(legal).toHaveLength(1);
  });

  it("creates the member's user row first (legal records reference it)", async () => {
    await send(A, give);
    expect(provisioned).toEqual(["user_a"]);
  });

  it.each(["2026-10-27", "2020-01-01", "9999-12-31", `${LEGAL_VERSIONS.aiConsent} `])("409 outdated for version %j; nothing recorded, AI stays off", async version => {
    const r = await send(A, { granted: true, version });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "outdated", aiConsentVersion: LEGAL_VERSIONS.aiConsent });
    expect(legal).toEqual([]);
    expect(await aiAllowedFor("user_a")).toBe(false);
  });

  it("consent to an older notice is outdated in /me until the current one is given", async () => {
    record("user_a", "ai_processing", "2026-10-27");
    expect((await getMe(A)).legal.aiConsent).toBe("outdated");
    expect(await aiAllowedFor("user_a")).toBe(false);
    await send(A, give);
    expect((await getMe(A)).legal.aiConsent).toBe("granted");
  });
});

describe("withdrawing", () => {
  it("is recorded and stops AI processing; /me shows it", async () => {
    await send(A, give);
    const r = await send(A, withdraw);
    expect(await r.json()).toEqual({ aiConsent: "withdrawn", aiConsentVersion: LEGAL_VERSIONS.aiConsent, aiConsentRequired: true });
    expect(legal.map(x => x.granted)).toEqual([true, false]);
    expect(await aiAllowedFor("user_a")).toBe(false);
    expect((await getMe(A)).legal.aiConsent).toBe("withdrawn");
  });

  it("works with any version, or none, and withdraws an outdated consent too", async () => {
    record("user_a", "ai_processing", "2026-10-27");
    expect((await send(A, { granted: false, version: "whatever" })).status).toBe(200);
    expect((await getMe(A)).legal.aiConsent).toBe("withdrawn");
  });

  it("withdrawing when nothing was given records nothing", async () => {
    const r = await send(A, withdraw);
    expect(r.status).toBe(200);
    expect((await r.json()).aiConsent).toBe("missing");
    expect(legal).toEqual([]);
  });

  it("withdrawing twice records it once", async () => {
    await send(A, give);
    await send(A, withdraw);
    await send(A, withdraw);
    expect(legal).toHaveLength(2);
  });

  it("can be given again after withdrawing; the history stays", async () => {
    await send(A, give);
    await send(A, withdraw);
    await send(A, give);
    expect(legal.map(x => x.granted)).toEqual([true, false, true]);
    expect(await aiAllowedFor("user_a")).toBe(true);
  });
});

describe("kept apart from the Terms", () => {
  it("giving AI consent records no Terms acceptance", async () => {
    await send(A, give);
    expect(legal.filter(r => r.kind !== "ai_processing")).toEqual([]);
    expect((await getMe(A)).legal.terms).toBe("missing");
  });

  it("withdrawing AI consent leaves accepted Terms granted", async () => {
    record("user_a", "terms", LEGAL_VERSIONS.terms);
    await send(A, give);
    await send(A, withdraw);
    expect((await getMe(A)).legal).toMatchObject({ terms: "granted", aiConsent: "withdrawn" });
  });

  it("a body naming another kind changes only AI consent", async () => {
    await send(A, { ...give, kind: "terms", terms: true });
    expect(legal.map(r => r.kind)).toEqual(["ai_processing"]);
  });
});

describe("existing rules", () => {
  it("reports when AI consent is not required (AI_CONSENT_MODE=not_required)", async () => {
    vi.stubEnv("AI_CONSENT_MODE", "not_required");
    expect((await (await send(A, withdraw)).json()).aiConsentRequired).toBe(false);
    expect(await aiAllowedFor("user_a")).toBe(true);
  });
});

describe("invalid requests", () => {
  it.each([
    ["no granted", { version: LEGAL_VERSIONS.aiConsent }],
    ["granted as a string", { granted: "true", version: LEGAL_VERSIONS.aiConsent }],
    ["granted as a number", { granted: 1, version: LEGAL_VERSIONS.aiConsent }],
    ["granting without a version", { granted: true }],
    ["granting with an empty version", { granted: true, version: "" }],
    ["granting with a number version", { granted: true, version: 20261027 }],
    ["a very long version", { granted: true, version: "x".repeat(65) }],
    ["an array", [give]],
    ["not JSON", "granted=true"],
    ["an empty body", ""],
  ])("400 for %s, nothing recorded", async (_, body) => {
    const r = await send(A, body);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe(JSON.stringify({ error: "invalid" }));
    expect(legal).toEqual([]);
  });

  it("a failed write answers 500 without details and AI stays off", async () => {
    failWrites = true;
    const r = await send(A, give);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(JSON.stringify({ error: "internal" }));
    expect(await aiAllowedFor("user_a")).toBe(false);
  });
});

describe("authentication", () => {
  it.each([null, "not-a-jwt", "zzz.zzz.zzz"])("401 for token %s, nothing recorded or created", async token => {
    const r = await send(token, give);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    expect(legal).toEqual([]);
    expect(provisioned).toEqual([]);
  });

  it("a browser session cookie alone never changes consent", async () => {
    expect((await send(null, give, { cookie: `__session=${A}` })).status).toBe(401);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("503 when Clerk cannot verify at all", async () => {
    clerkDown = true;
    expect((await send(A, give)).status).toBe(503);
    expect(legal).toEqual([]);
  });
});

describe("isolation between members", () => {
  it("changes only the token owner's consent, whatever user id the client sends", async () => {
    await send(A, { ...give, userId: "user_b" }, { "x-user-id": "user_b" }, `${URL}?userId=user_b`);
    expect(legal.map(r => r.userId)).toEqual(["user_a"]);
    expect(await aiAllowedFor("user_b")).toBe(false);
  });

  it("one member withdrawing leaves another's consent in place", async () => {
    await send(A, give);
    await send(B, give);
    await send(B, withdraw);
    expect(await aiAllowedFor("user_a")).toBe(true);
    expect(await aiAllowedFor("user_b")).toBe(false);
  });
});

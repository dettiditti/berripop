import { beforeEach, describe, expect, it, vi } from "vitest";
import { entitlementsFrom } from "../lib/billing/entitlements";
import { LEGAL_VERSIONS, legalState, type LegalRecordRow } from "../lib/legal/records";

/*
 * GET /api/v1/me: Bearer-only Clerk authentication, the user id taken from
 * the verified token alone, and a response limited to id, plan and legal
 * state. Clerk and the database are in-memory stand-ins; the plan and legal
 * rules are the real ones.
 */

// Tokens Clerk would accept, and whose they are.
const A = "aaa.bbb.ccc";
const B = "ddd.eee.fff";
const EXPIRED = "xxx.yyy.zzz";
const valid: Record<string, string> = { [A]: "user_a", [B]: "user_b" };

const seen: Request[] = [];
let clerkDown = false;
const authenticateRequest = vi.fn(async (req: Request, opts: { acceptsToken?: string }) => {
  if (clerkDown) throw new Error("jwks fetch failed: secret details");
  seen.push(req);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const userId = opts.acceptsToken === "session_token" ? valid[token] : undefined;
  return userId
    ? { isAuthenticated: true, toAuth: () => ({ userId }) }
    : { isAuthenticated: false, toAuth: () => ({ userId: null }) };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ authenticateRequest }) }));

// Per-user stored facts, read through the real entitlement and legal rules.
const subs: Record<string, Parameters<typeof entitlementsFrom>[0]> = {
  user_a: { status: "active", planId: "premium", interval: "month", currentPeriodEnd: new Date("2026-11-27T00:00:00Z"), cancelAtPeriodEnd: false },
};
const legalRows: Record<string, LegalRecordRow[]> = {
  user_a: [
    { kind: "terms", version: LEGAL_VERSIONS.terms, granted: true, createdAt: new Date("2026-10-27T10:00:00Z") },
    { kind: "ai_processing", version: "2026-10-27", granted: true, createdAt: new Date("2026-10-27T10:00:00Z") },
  ],
  user_b: [
    { kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted: true, createdAt: new Date("2026-10-27T09:00:00Z") },
    { kind: "ai_processing", version: LEGAL_VERSIONS.aiConsent, granted: false, createdAt: new Date("2026-10-27T11:00:00Z") },
  ],
};
let servicesFail = false;
const lookedUp: string[] = [];
vi.mock("../lib/server/entitlements", () => ({
  getUserEntitlements: async (userId: string) => {
    lookedUp.push(userId);
    if (servicesFail) throw new Error("db password=hunter2");
    return entitlementsFrom(subs[userId] ?? null);
  },
}));
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

const { GET } = await import("../app/api/v1/me/route");

const call = (headers: Record<string, string> = {}, url = "https://www.berripop.com/api/v1/me") => GET(new Request(url, { headers }));

beforeEach(() => {
  seen.length = 0;
  lookedUp.length = 0;
  clerkDown = false;
  servicesFail = false;
  authenticateRequest.mockClear();
});

describe("authentication", () => {
  it("401 without a token, and Clerk is not even asked", async () => {
    const r = await call();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    expect(r.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it.each(["Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "Bearer not-a-jwt", `Bearer ${A} ${B}`, `Token ${A}`, `Bearer ${A}.extra`])(
    "401 for a malformed header: %s",
    async header => {
      expect((await call({ authorization: header })).status).toBe(401);
      expect(authenticateRequest).not.toHaveBeenCalled();
    },
  );

  it("401 for a token Clerk rejects (expired, bad signature, other token type)", async () => {
    const r = await call({ authorization: `Bearer ${EXPIRED}` });
    expect(r.status).toBe(401);
    expect(authenticateRequest).toHaveBeenCalledWith(expect.any(Request), { acceptsToken: "session_token" });
  });

  it("a browser session cookie alone never authenticates the API", async () => {
    const r = await call({ cookie: "__session=aaa.bbb.ccc; __client_uat=1" });
    expect(r.status).toBe(401);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("only the Authorization header reaches Clerk: cookies and other headers are dropped", async () => {
    await call({ authorization: `Bearer ${A}`, cookie: `__session=${B}`, "x-user-id": "user_b" });
    expect(seen).toHaveLength(1);
    expect([...seen[0].headers.keys()]).toEqual(["authorization"]);
  });

  it("503 with no details when Clerk cannot verify at all", async () => {
    clerkDown = true;
    const r = await call({ authorization: `Bearer ${A}` });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe(JSON.stringify({ error: "unavailable" }));
  });
});

describe("identity and isolation", () => {
  it("returns the token owner's id, plan and legal state", async () => {
    const r = await call({ authorization: `Bearer ${A}` });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.user).toEqual({ id: "user_a" });
    expect(body.entitlements).toMatchObject({ plan: "premium", status: "active", interval: "month", cancelAtPeriodEnd: false, paymentIssue: false, ended: false });
    expect(body.entitlements.currentPeriodEnd).toBe("2026-11-27T00:00:00.000Z");
  });

  it("ignores any user id the client supplies (query or header)", async () => {
    const r = await call({ authorization: `Bearer ${B}`, "x-user-id": "user_a" }, "https://www.berripop.com/api/v1/me?userId=user_a");
    const body = await r.json();
    expect(body.user.id).toBe("user_b");
    expect(body.entitlements.plan).toBe("free");
    expect(lookedUp).toEqual(["user_b"]);
  });

  it("each token sees only its own data", async () => {
    const a = await (await call({ authorization: `Bearer ${A}` })).json();
    const b = await (await call({ authorization: `Bearer ${B}` })).json();
    expect(a.entitlements.plan).toBe("premium");
    expect(b.entitlements.plan).toBe("free");
    expect(a.user.id).not.toBe(b.user.id);
  });
});

describe("existing rules", () => {
  it("free plan limits for a member without a subscription", async () => {
    const body = await (await call({ authorization: `Bearer ${B}` })).json();
    expect(body.entitlements).toMatchObject({ plan: "free", status: "none", currentPeriodEnd: null });
    expect(body.entitlements.limits).toEqual(entitlementsFrom(null).limits);
  });

  it("AI consent given to an older notice is outdated; terms granted at the current version", async () => {
    const { legal } = await (await call({ authorization: `Bearer ${A}` })).json();
    expect(legal).toEqual({ terms: "granted", termsVersion: LEGAL_VERSIONS.terms, aiConsent: "outdated", aiConsentVersion: LEGAL_VERSIONS.aiConsent, aiConsentRequired: true });
  });

  it("withdrawn consent stays withdrawn; missing terms are missing", async () => {
    const { legal } = await (await call({ authorization: `Bearer ${B}` })).json();
    expect(legal).toMatchObject({ terms: "missing", aiConsent: "withdrawn" });
  });
});

describe("privacy", () => {
  it("returns exactly id, plan and legal fields, and is never cached", async () => {
    const r = await call({ authorization: `Bearer ${A}` });
    const body = await r.json();
    expect(Object.keys(body).sort()).toEqual(["entitlements", "legal", "user"]);
    expect(Object.keys(body.user)).toEqual(["id"]);
    expect(Object.keys(body.entitlements).sort()).toEqual(["cancelAtPeriodEnd", "currentPeriodEnd", "ended", "interval", "limits", "paymentIssue", "plan", "status"]);
    expect(Object.keys(body.legal).sort()).toEqual(["aiConsent", "aiConsentRequired", "aiConsentVersion", "terms", "termsVersion"]);
    const text = JSON.stringify(body);
    // Limits are plan settings (their names mention "journal"/"insight"); content and payment data must not appear.
    expect(Object.keys(body.entitlements.limits).sort()).toEqual(Object.keys(entitlementsFrom(null).limits).sort());
    expect(text).not.toMatch(/stripe|cus_|sub_|whsec|sk_(live|test)|pk_(live|test)|"token"|"body"|"note"|"entries"|"text"/i);
    expect(text).not.toContain(A);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
  });

  it("internal failures answer 500 without details", async () => {
    servicesFail = true;
    const r = await call({ authorization: `Bearer ${A}` });
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(JSON.stringify({ error: "internal" }));
  });
});

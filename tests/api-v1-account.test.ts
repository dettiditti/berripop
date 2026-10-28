import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { entitlementsFrom } from "../lib/billing/entitlements";
import { users } from "../lib/db/schema";
import { LEGAL_VERSIONS } from "../lib/legal/records";

/*
 * GET /api/v1/account/export and POST /api/v1/account/delete: the web's data
 * rights behind Bearer-only authentication. The real deletion service
 * (confirmation word, subscription rule, user row removal, Clerk login
 * deletion) runs against an in-memory users table whose queries are read
 * from the real Drizzle conditions; deleting a user row stands in for the
 * cascade. The export itself is the web's exportAccount, replaced here by a
 * stand-in that returns the member's stored data. Nothing reaches Clerk,
 * Stripe or Neon.
 */

const A = "aaa.bbb.ccc";
const B = "ddd.eee.fff";
const P = "ppp.qqq.rrr";
const E = "eee.nnn.ddd";
// Tokens stay valid for their short lifetime even after the login is deleted.
const valid: Record<string, string> = { [A]: "user_a", [B]: "user_b", [P]: "user_paying", [E]: "user_ending" };
const clerkUsers = new Set<string>();
let clerkDown = false;
let clerkDeleteFails = false;
const deletedLogins: string[] = [];

const authenticateRequest = vi.fn(async (req: Request) => {
  if (clerkDown) throw new Error("jwks fetch failed");
  const userId = valid[req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
  return userId ? { isAuthenticated: true, toAuth: () => ({ userId }) } : { isAuthenticated: false, toAuth: () => ({ userId: null }) };
});
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    authenticateRequest,
    users: {
      getUser: async (id: string) => {
        if (!clerkUsers.has(id)) throw Object.assign(new Error("not found"), { status: 404 });
        return { firstName: "Name", username: null };
      },
      deleteUser: async (id: string) => {
        if (clerkDeleteFails) throw new Error("clerk api 500: secret");
        clerkUsers.delete(id);
        deletedLogins.push(id);
      },
    },
  }),
  auth: async () => ({ userId: null }),
  currentUser: async () => null,
}));

// Each member's stored data; deleting the user row removes it all (the cascade).
const store = new Map<string, { checkins: string[]; journal: string[] }>();
const dialect = new PgDialect();
type Q = { op: "select" | "insert" | "delete" | "update"; table?: unknown; cond?: SQL; values?: { id: string } };
function run(q: Q): unknown[] {
  if (q.table !== users) return []; // no circles in these fixtures
  if (q.op === "insert") {
    if (store.has(q.values!.id)) return [];
    store.set(q.values!.id, { checkins: [], journal: [] });
    return [{ id: q.values!.id }];
  }
  const ids = dialect.sqlToQuery(q.cond!).params as string[];
  if (q.op === "delete") {
    for (const id of ids) store.delete(id);
    return [];
  }
  return ids.filter(id => store.has(id)).map(id => ({ id }));
}
function chain(q: Q) {
  const c: Record<string, unknown> = {
    from: (t: unknown) => ((q.table = t), c),
    where: (cond: SQL) => ((q.cond = cond), c),
    values: (v: { id: string }) => ((q.values = v), c),
    set: () => c,
    orderBy: () => c, limit: () => c, innerJoin: () => c, leftJoin: () => c, onConflictDoNothing: () => c, returning: () => c,
    then: (ok: (v: unknown) => void, bad: (e: unknown) => void) => { try { ok(run(q)); } catch (e) { bad(e); } },
  };
  return c;
}
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => chain({ op: "select" }),
    insert: (t: unknown) => chain({ op: "insert", table: t }),
    delete: (t: unknown) => chain({ op: "delete", table: t }),
    update: (t: unknown) => chain({ op: "update", table: t }),
  }),
}));

const subs: Record<string, Parameters<typeof entitlementsFrom>[0]> = {
  user_paying: { status: "active", planId: "premium", interval: "month", currentPeriodEnd: new Date("2026-11-27T00:00:00Z"), cancelAtPeriodEnd: false },
  user_ending: { status: "active", planId: "premium", interval: "month", currentPeriodEnd: new Date("2026-11-27T00:00:00Z"), cancelAtPeriodEnd: true },
};
vi.mock("../lib/server/entitlements", () => ({ getUserEntitlements: async (id: string) => entitlementsFrom(subs[id] ?? null) }));
const stopRenewal = vi.fn();
vi.mock("../lib/server/billing", () => ({ stopRenewal }));
vi.mock("../lib/server/journal", () => ({ exportJournal: async () => ({ entries: [], reflections: [], insights: [] }) }));
vi.mock("../lib/server/invoicing", () => ({ invoicesForUser: async () => [] }));
vi.mock("../lib/server/analytics", () => ({ track: async () => {} }));
vi.mock("../lib/server/legal", () => ({
  getLegalStatus: async () => ({ terms: "granted", termsVersion: LEGAL_VERSIONS.terms, aiConsent: "missing", aiConsentVersion: LEGAL_VERSIONS.aiConsent, aiConsentRequired: true }),
}));
const exported: string[] = [];
let exportFails = false;
vi.mock("../lib/server/account", async orig => ({
  ...(await orig<typeof import("../lib/server/account")>()),
  exportAccount: async (userId: string) => {
    exported.push(userId);
    if (exportFails) throw new Error("db password=hunter2");
    const d = store.get(userId);
    return { exportedAt: "2026-10-27T11:00:00.000Z", account: { id: userId }, dailyCheckins: d?.checkins ?? [], journal: { entries: d?.journal ?? [] } };
  },
}));

const exportRoute = await import("../app/api/v1/account/export/route");
const deleteRoute = await import("../app/api/v1/account/delete/route");
const checkinRoute = await import("../app/api/v1/checkin/today/route");

const base = "https://www.berripop.com/api/v1/account";
const auth = (token: string | null): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const exp = (token: string | null, extra: Record<string, string> = {}, url = `${base}/export`) => exportRoute.GET(new Request(url, { headers: { ...auth(token), ...extra } }));
const del = (token: string | null, body: unknown, extra: Record<string, string> = {}, url = `${base}/delete`) =>
  deleteRoute.POST(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...auth(token), ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const putCheckin = (token: string) =>
  checkinRoute.PUT(new Request("https://www.berripop.com/api/v1/checkin/today", { method: "PUT", headers: auth(token), body: JSON.stringify({ state: "good" }) }));

beforeEach(() => {
  store.clear();
  clerkUsers.clear();
  for (const id of Object.values(valid)) {
    store.set(id, { checkins: [`${id} check-in`], journal: [`${id} journal`] });
    clerkUsers.add(id);
  }
  deletedLogins.length = exported.length = 0;
  clerkDown = clerkDeleteFails = exportFails = false;
  stopRenewal.mockClear();
  authenticateRequest.mockClear();
});

describe("GET /api/v1/account/export", () => {
  it("returns the token owner's data as a private, uncached download", async () => {
    const r = await exp(A);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.account).toEqual({ id: "user_a" });
    expect(body.dailyCheckins).toEqual(["user_a check-in"]);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="berripop-export-\d{4}-\d{2}-\d{2}\.json"$/);
  });

  it("only ever exports the token owner, whatever user id the client sends", async () => {
    const text = await (await exp(B, { "x-user-id": "user_a" }, `${base}/export?userId=user_a`)).text();
    expect(exported).toEqual(["user_b"]);
    expect(text).not.toContain("user_a");
  });

  it("401 without a valid Bearer token; a cookie alone never exports", async () => {
    for (const r of [await exp(null), await exp("zzz.zzz.zzz"), await exp(null, { cookie: `__session=${A}` })]) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
    expect(exported).toEqual([]);
  });

  it("503 when Clerk cannot verify; 500 without details when the export fails", async () => {
    clerkDown = true;
    expect((await exp(A)).status).toBe(503);
    clerkDown = false;
    exportFails = true;
    const r = await exp(A);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(JSON.stringify({ error: "internal" }));
  });
});

describe("POST /api/v1/account/delete", () => {
  it.each(["TÖRLÉS", "  törlés ", "DELETE", "delete"])("deletes the data and the login with %j", async confirmation => {
    const r = await del(A, { confirmation });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ deleted: true, loginDeleted: true });
    expect(store.has("user_a")).toBe(false);
    expect(deletedLogins).toEqual(["user_a"]);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([["no confirmation", {}], ["a wrong word", { confirmation: "torles" }], ["yes", { confirmation: "yes" }], ["a non-string", { confirmation: true }]])(
    "400 confirmation for %s; nothing deleted",
    async (_, body) => {
      const r = await del(A, body);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "confirmation" });
      expect(store.has("user_a")).toBe(true);
      expect(deletedLogins).toEqual([]);
    },
  );

  it.each([["not JSON", "confirmation=TÖRLÉS"], ["an array", ["TÖRLÉS"]], ["an empty body", ""]])("400 invalid for %s; nothing deleted", async (_, body) => {
    const r = await del(A, body);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid" });
    expect(store.has("user_a")).toBe(true);
  });

  it("409 while a subscription would keep renewing; nothing deleted, no Stripe call", async () => {
    const r = await del(P, { confirmation: "TÖRLÉS" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "active_subscription" });
    expect(store.has("user_paying")).toBe(true);
    expect(deletedLogins).toEqual([]);
    expect(stopRenewal).not.toHaveBeenCalled();
  });

  it("a subscription already set to end does not block deletion", async () => {
    expect((await del(E, { confirmation: "TÖRLÉS" })).status).toBe(200);
    expect(store.has("user_ending")).toBe(false);
  });

  it("if the login cannot be removed, the data is still gone and the app is told", async () => {
    clerkDeleteFails = true;
    const r = await del(A, { confirmation: "TÖRLÉS" });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(JSON.stringify({ deleted: true, loginDeleted: false }));
    expect(store.has("user_a")).toBe(false);
  });

  it("deletes only the token owner, whatever user id the client sends", async () => {
    await del(B, { confirmation: "TÖRLÉS", userId: "user_a" }, { "x-user-id": "user_a" }, `${base}/delete?userId=user_a`);
    expect(store.has("user_b")).toBe(false);
    expect(store.has("user_a")).toBe(true);
    expect(deletedLogins).toEqual(["user_b"]);
    expect((await exp(A)).status).toBe(200);
  });

  it("401 without a valid Bearer token; a cookie alone never deletes", async () => {
    for (const r of [await del(null, { confirmation: "TÖRLÉS" }), await del("zzz.zzz.zzz", { confirmation: "TÖRLÉS" }), await del(null, { confirmation: "TÖRLÉS" }, { cookie: `__session=${A}` })]) {
      expect(r.status).toBe(401);
    }
    expect(store.size).toBe(4);
    expect(deletedLogins).toEqual([]);
  });

  it("503 when Clerk cannot verify; nothing deleted", async () => {
    clerkDown = true;
    expect((await del(A, { confirmation: "TÖRLÉS" })).status).toBe(503);
    expect(store.has("user_a")).toBe(true);
  });
});

describe("after deletion", () => {
  it("a still-unexpired token cannot recreate the account through a write", async () => {
    await del(A, { confirmation: "TÖRLÉS" });
    const r = await putCheckin(A);
    expect(r.status).toBe(401);
    expect(store.has("user_a")).toBe(false);
  });

  it("the export of a deleted account holds none of its data", async () => {
    await del(A, { confirmation: "TÖRLÉS" });
    const body = await (await exp(A)).json();
    expect(body.dailyCheckins).toEqual([]);
    expect(body.journal.entries).toEqual([]);
  });

  it("deleting again is harmless", async () => {
    await del(A, { confirmation: "TÖRLÉS" });
    expect((await del(A, { confirmation: "TÖRLÉS" })).status).toBe(200);
    expect(store.size).toBe(3);
  });
});

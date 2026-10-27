import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "../lib/db/schema";

/*
 * GET /api/v1/checkin/today and first-request user provisioning for the
 * mobile API. Clerk, the users table and today's check-ins are in-memory
 * stand-ins; nothing reaches Clerk or Neon.
 */

const A = "aaa.bbb.ccc";
const B = "ddd.eee.fff";
const valid: Record<string, string> = { [A]: "user_a", [B]: "user_b" };
// The user Clerk last verified: the users-table stand-in answers for them.
let verified = "";
let clerkDown = false;
let profileDown = false;

const authenticateRequest = vi.fn(async (req: Request) => {
  if (clerkDown) throw new Error("jwks fetch failed");
  const userId = valid[req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
  verified = userId ?? "";
  return userId ? { isAuthenticated: true, toAuth: () => ({ userId }) } : { isAuthenticated: false, toAuth: () => ({ userId: null }) };
});
const getUser = vi.fn(async (id: string) => {
  if (profileDown) throw new Error("clerk api 500");
  return { firstName: id === "user_a" ? "Anna" : null, username: id === "user_b" ? "bea_b" : null };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ authenticateRequest, users: { getUser } }),
  auth: async () => ({ userId: null }),
  currentUser: async () => null,
}));

const userRows = new Map<string, { id: string; displayName: string }>();
const tracked: [string, string][] = [];
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (userRows.has(verified) ? [{ id: verified }] : []) }) }) }),
    insert: (t: unknown) => ({
      values: (v: { id: string; displayName: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (t !== users) throw new Error("unexpected table");
            if (userRows.has(v.id)) return [];
            userRows.set(v.id, v);
            return [{ id: v.id }];
          },
        }),
      }),
    }),
  }),
}));
vi.mock("../lib/server/analytics", () => ({ track: async (userId: string, event: string) => void tracked.push([userId, event]) }));

const checkins: Record<string, Record<string, unknown>> = {};
const asked: [string, string][] = [];
let dbFails = false;
vi.mock("../lib/server/checkin", () => ({
  todayCheckin: async (userId: string, date: string) => {
    asked.push([userId, date]);
    if (dbFails) throw new Error("db password=hunter2");
    return checkins[userId] ?? null;
  },
}));

const { GET } = await import("../app/api/v1/checkin/today/route");
const { withBearer, apiJson } = await import("../lib/server/mobileApi");

const call = (headers: Record<string, string> = {}, url = "https://www.berripop.com/api/v1/checkin/today") => GET(new Request(url, { headers }));

beforeEach(() => {
  verified = "";
  clerkDown = profileDown = dbFails = false;
  userRows.clear();
  tracked.length = asked.length = 0;
  for (const k of Object.keys(checkins)) delete checkins[k];
  authenticateRequest.mockClear();
  getUser.mockClear();
});

describe("GET /api/v1/checkin/today", () => {
  it("401 without a valid Bearer token, cookies don't count, nothing is read", async () => {
    for (const headers of [{},{ authorization: "Bearer nope" }, { authorization: "Bearer zzz.zzz.zzz" }, { cookie: `__session=${A}` }] as Record<string, string>[]) {
      const r = await call(headers);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
    expect(asked).toEqual([]);
  });

  it("null when the member has not checked in today, for today's Budapest date", async () => {
    const r = await call({ authorization: `Bearer ${A}` });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), checkin: null });
    expect(asked).toEqual([["user_a", body.date]]);
  });

  it("returns the token owner's own check-in in the web snapshot's shape", async () => {
    checkins.user_a = {
      id: "row-1", userId: "user_a", date: "2026-10-27", state: "tired", topics: ["work"], note: "long day", need: "listen",
      aiReply: { heard: "h", question: "q?", idea: null }, createdAt: new Date("2026-10-27T08:00:00Z"), updatedAt: new Date("2026-10-27T09:00:00Z"),
    };
    const { checkin } = await (await call({ authorization: `Bearer ${A}` })).json();
    expect(checkin).toEqual({ date: "2026-10-27", state: "tired", topics: ["work"], note: "long day", need: "listen", aiReply: { heard: "h", question: "q?", idea: null }, updatedAt: "2026-10-27T09:00:00.000Z" });
    // No internal row id or user id in the payload.
    expect(Object.keys(checkin)).not.toContain("id");
    expect(Object.keys(checkin)).not.toContain("userId");
  });

  it("ignores a client-supplied user id and never shows another member's check-in", async () => {
    checkins.user_a = { id: "r", userId: "user_a", date: "2026-10-27", state: "sad", topics: [], note: "private", need: null, aiReply: null, createdAt: new Date(), updatedAt: new Date() };
    const r = await call({ authorization: `Bearer ${B}`, "x-user-id": "user_a" }, "https://www.berripop.com/api/v1/checkin/today?userId=user_a");
    expect((await r.json()).checkin).toBeNull();
    expect(asked.map(a => a[0])).toEqual(["user_b"]);
  });

  it("is read-only: no user row is created", async () => {
    await call({ authorization: `Bearer ${A}` });
    expect(userRows.size).toBe(0);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("private, never cached; failures carry no details", async () => {
    const ok = await call({ authorization: `Bearer ${A}` });
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("vary")).toBe("Authorization");
    dbFails = true;
    const r = await call({ authorization: `Bearer ${A}` });
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(JSON.stringify({ error: "internal" }));
    dbFails = false;
    clerkDown = true;
    const down = await call({ authorization: `Bearer ${A}` });
    expect(down.status).toBe(503);
    expect(await down.text()).toBe(JSON.stringify({ error: "unavailable" }));
  });
});

describe("first-request provisioning (for writing endpoints)", () => {
  const provisioned = (headers: Record<string, string>) =>
    withBearer(new Request("https://www.berripop.com/api/v1/x", { method: "POST", headers }), async userId => apiJson({ userId }), { provision: true });

  it("creates the user row once, named from Clerk, and records signup once", async () => {
    expect(await (await provisioned({ authorization: `Bearer ${A}` })).json()).toEqual({ userId: "user_a" });
    await provisioned({ authorization: `Bearer ${A}` });
    expect([...userRows.values()]).toEqual([{ id: "user_a", displayName: "Anna" }]);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(tracked).toEqual([["user_a", "signup_completed"]]);
  });

  it("falls back to the username, and to no name when Clerk's user lookup fails", async () => {
    await provisioned({ authorization: `Bearer ${B}` });
    expect(userRows.get("user_b")?.displayName).toBe("bea_b");
    userRows.clear();
    profileDown = true;
    expect((await provisioned({ authorization: `Bearer ${A}` })).status).toBe(200);
    expect(userRows.get("user_a")?.displayName).toBe("");
  });

  it("an invalid token provisions nothing and the handler never runs", async () => {
    const handler = vi.fn();
    const r = await withBearer(new Request("https://x/api/v1/x", { headers: { authorization: "Bearer zzz.zzz.zzz" } }), handler, { provision: true });
    expect(r.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(userRows.size).toBe(0);
  });
});

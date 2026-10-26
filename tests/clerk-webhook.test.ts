import { createHmac, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processClerkEvent } from "../lib/account/clerkWebhook";

const deleted = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/server/account", () => ({
  deleteAccountForRemovedLogin: async (id: string) => {
    if (id === "user_fail") throw new Error("db down");
    deleted.push(id);
  },
}));

describe("Clerk event routing", () => {
  it("deletes the member's data only for user.deleted with an id", async () => {
    const seen: string[] = [];
    const deps = { deleteAccount: async (id: string) => { seen.push(id); } };
    expect(await processClerkEvent({ type: "user.deleted", data: { id: "user_1" } }, deps)).toBe("deleted");
    expect(await processClerkEvent({ type: "user.deleted", data: { id: null } }, deps)).toBe("ignored");
    expect(await processClerkEvent({ type: "user.created", data: { id: "user_2" } }, deps)).toBe("ignored");
    expect(seen).toEqual(["user_1"]);
  });
});

/* ---------- the route, with real Svix signatures ---------- */

const key = randomBytes(24);
const secret = `whsec_${key.toString("base64")}`;

function signed(payload: object, signWith = key) {
  const body = JSON.stringify(payload);
  const id = `msg_${randomBytes(6).toString("hex")}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", signWith).update(`${id}.${ts}.${body}`).digest("base64");
  return new NextRequest("https://www.berripop.com/api/clerk/webhook", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
  });
}

const userDeleted = (id: string) => ({ type: "user.deleted", object: "event", data: { id, object: "user", deleted: true } });

describe("Clerk webhook route", () => {
  beforeEach(() => {
    deleted.length = 0;
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deletes the member for a correctly signed user.deleted event", async () => {
    const { POST } = await import("../app/api/clerk/webhook/route");
    const res = await POST(signed(userDeleted("user_abc")));
    expect(res.status).toBe(200);
    expect(deleted).toEqual(["user_abc"]);
  });

  it("rejects a forged signature and deletes nothing", async () => {
    const { POST } = await import("../app/api/clerk/webhook/route");
    const res = await POST(signed(userDeleted("user_victim"), randomBytes(24)));
    expect(res.status).toBe(400);
    expect(deleted).toEqual([]);
  });

  it("answers 500 when deletion fails, so Clerk retries", async () => {
    const { POST } = await import("../app/api/clerk/webhook/route");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(signed(userDeleted("user_fail")))).status).toBe(500);
  });

  it("is unavailable without a signing secret", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    const { POST } = await import("../app/api/clerk/webhook/route");
    expect((await POST(signed(userDeleted("user_abc")))).status).toBe(503);
    expect(deleted).toEqual([]);
  });
});

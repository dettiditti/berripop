import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getTableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { legalRecords } from "../lib/db/schema";
import { LEGAL_VERSIONS, termsPrompt } from "../lib/legal/records";

/*
 * Terms acceptance: who is asked and how, what is recorded, and that checkout
 * stays closed until the server has the current acceptance. legal_records is
 * an in-memory stand-in; no request reaches Neon, Clerk or Stripe.
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
        rows.push({ ...v, createdAt: new Date() });
      },
    }),
  }),
}));
// Every row belongs to user "u"; the stand-in query ignores the filter.
vi.mock("../lib/server/session", () => ({ requireUserId: async () => "u" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@clerk/nextjs/server", async orig => ({ ...(await orig<object>()), currentUser: async () => null, clerkClient: async () => ({}) }));
const createCheckoutSession = vi.fn(async () => ({ ok: true as const, url: "https://checkout.test" }));
vi.mock("../lib/server/billing", () => ({ createCheckoutSession }));
for (const m of ["account", "assessment", "growth", "journal", "goalJourney", "personal", "service", "analytics"]) vi.doMock(`../lib/server/${m}`, () => ({}));

const legal = await import("../lib/server/legal");
const { startCheckoutAction } = await import("../lib/server/actions");
const { SIGNED_IN_ONLY } = await import("../middleware");

beforeEach(() => {
  rows.length = 0;
  failWrites = false;
  createCheckoutSession.mockClear();
});

describe("who is asked to accept the Terms, and how", () => {
  it("a first-time member gets the onboarding step", () => {
    expect(termsPrompt("missing", true)).toBe("onboarding");
  });

  it("a member who accepted the current version is not interrupted", () => {
    expect(termsPrompt("granted", true)).toBe("none");
    expect(termsPrompt("granted", false)).toBe("none");
  });

  it("a member already using Berripop with an older or no acceptance gets the dialog", () => {
    expect(termsPrompt("outdated", false)).toBe("dialog");
    expect(termsPrompt("missing", false)).toBe("dialog");
  });
});

describe("recording acceptance", () => {
  it("records the accepted version with a timestamp, once", async () => {
    expect((await legal.getLegalStatus("u")).terms).toBe("missing");
    expect(await legal.acceptTerms("u", LEGAL_VERSIONS.terms)).toEqual({ ok: true });
    expect(await legal.acceptTerms("u", LEGAL_VERSIONS.terms)).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u", kind: "terms", version: LEGAL_VERSIONS.terms, granted: true });
    expect(getTableConfig(legalRecords).columns.find(c => c.name === "created_at")?.hasDefault).toBe(true);
    expect((await legal.getLegalStatus("u")).terms).toBe("granted");
  });

  it("asks again after a version bump", async () => {
    rows.push({ userId: "u", kind: "terms", version: "2020-01-01", granted: true, createdAt: new Date(0) });
    expect((await legal.getLegalStatus("u")).terms).toBe("outdated");
    await legal.acceptTerms("u", LEGAL_VERSIONS.terms);
    expect((await legal.getLegalStatus("u")).terms).toBe("granted");
  });

  it("a refused or failed acceptance unlocks nothing", async () => {
    expect(await legal.acceptTerms("u", "2020-01-01")).toEqual({ ok: false, error: "outdated" });
    failWrites = true;
    await expect(legal.acceptTerms("u", LEGAL_VERSIONS.terms)).rejects.toThrow();
    expect(rows).toHaveLength(0);
    expect((await legal.getLegalStatus("u")).terms).toBe("missing");
    expect(await startCheckoutAction("month")).toEqual({ ok: false, error: "terms_required" });
  });
});

describe("checkout", () => {
  it("is refused on the server until the current Terms are accepted", async () => {
    rows.push({ userId: "u", kind: "terms", version: "2020-01-01", granted: true, createdAt: new Date(0) });
    expect(await startCheckoutAction("month")).toEqual({ ok: false, error: "terms_required" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("proceeds once they are", async () => {
    await legal.acceptTerms("u", LEGAL_VERSIONS.terms);
    expect(await startCheckoutAction("month")).toEqual({ ok: true, url: "https://checkout.test" });
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
  });
});

describe("public pages", () => {
  it("leaves the legal pages and pricing open to signed-out visitors", () => {
    const signedInOnly = createRouteMatcher(SIGNED_IN_ONLY);
    for (const path of ["/terms", "/privacy", "/cookies", "/contact", "/pricing", "/"]) {
      expect(signedInOnly(new NextRequest(`https://www.berripop.com${path}`))).toBe(false);
    }
    expect(signedInOnly(new NextRequest("https://www.berripop.com/settings"))).toBe(true);
  });
});

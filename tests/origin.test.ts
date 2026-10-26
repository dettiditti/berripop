import { describe, expect, it } from "vitest";
import { appOrigin } from "../lib/billing/origin";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
const forged = headers({ "x-forwarded-host": "evil.example", host: "evil.example" });

describe("Stripe return origin", () => {
  it("uses APP_URL over any header", () => {
    expect(appOrigin({ APP_URL: "https://www.berripop.com/" }, forged)).toBe("https://www.berripop.com");
  });
  it("uses Vercel's production domain in production, ignoring forged headers", () => {
    expect(appOrigin({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "www.berripop.com" }, forged)).toBe("https://www.berripop.com");
  });
  it("falls back to the request host for previews and local development", () => {
    expect(appOrigin({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "www.berripop.com" }, headers({ "x-forwarded-host": "berripop-abc.vercel.app" }))).toBe("https://berripop-abc.vercel.app");
    expect(appOrigin({}, headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });
});

import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { apnsConfig, isDeadToken, providerToken } = await import("../lib/push/apns");
const { devicesToRemind, isDeviceToken, reminderText } = await import("../lib/push/reminder");

const token = "a".repeat(64);

describe("daily reminder", () => {
  it("accepts only APNs-style hex tokens", () => {
    expect(isDeviceToken(token)).toBe(true);
    expect(isDeviceToken("A1".repeat(40))).toBe(true);
    expect(isDeviceToken("abc")).toBe(false);
    expect(isDeviceToken("z".repeat(64))).toBe(false);
    expect(isDeviceToken(`${token}; drop`)).toBe(false);
    expect(isDeviceToken(42)).toBe(false);
  });

  it("never names anything personal in the notification", () => {
    for (const locale of ["hu", "en"] as const) {
      const { title, body } = reminderText(locale);
      expect(title.length).toBeGreaterThan(0);
      expect(`${title} ${body}`).not.toMatch(/\{|\}/);
    }
  });

  it("reminds once a day, and only members who have not been here today", () => {
    const today = "2026-11-05";
    const devices = [
      { token: "1", userId: "u1", lastSentDate: null },
      { token: "2", userId: "u2", lastSentDate: today },
      { token: "3", userId: "u3", lastSentDate: "2026-11-04" },
      { token: "4", userId: "u4", lastSentDate: null },
    ];
    expect(devicesToRemind(devices, new Set(["u4"]), today).map(d => d.token)).toEqual(["1", "3"]);
  });
});

describe("Apple push client", () => {
  it("stays off until the key, key id and team id are all set", () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T" })).toBeNull();
    const c = apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_PRIVATE_KEY: "a\\nb" });
    expect(c).toMatchObject({ bundleId: "com.berripop.app", production: false, privateKey: "a\nb" });
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_PRIVATE_KEY: "x", APNS_ENV: "production" })?.production).toBe(true);
  });

  it("signs a valid ES256 provider token", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = providerToken({ keyId: "KEY123", teamId: "TEAM456", privateKey: pem, bundleId: "x", production: false }, 1_700_000_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM456", iat: 1_700_000_000 });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("forgets only devices that are gone for good", () => {
    expect(isDeadToken({ token, ok: false, status: 410 })).toBe(true);
    expect(isDeadToken({ token, ok: false, status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(isDeadToken({ token, ok: false, status: 429, reason: "TooManyRequests" })).toBe(false);
    expect(isDeadToken({ token, ok: false, status: 0, reason: "timeout" })).toBe(false);
  });
});

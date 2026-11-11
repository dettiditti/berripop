import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPLE_ISSUER, AppleTokenRejected, appleTokenKid, GOOGLE_ISSUERS, verifyAppleIdToken, verifyIdToken, type AppleKey } from "../lib/auth/appleToken";

const AUD = "com.berripop.app";
const NOW = new Date("2026-11-11T18:00:00Z");
const nowS = Math.floor(NOW.getTime() / 1000);

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY: AppleKey = { ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
const keys = [KEY];

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key = pair.privateKey): string {
  const h = b64({ alg: "RS256", kid: "k1", ...header });
  const p = b64({ iss: APPLE_ISSUER, aud: AUD, sub: "001234.abc", email: "Anna@Example.com", email_verified: "true", iat: nowS - 30, exp: nowS + 570, ...claims });
  const s = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url");
  return `${h}.${p}.${s}`;
}
function reason(t: unknown): string {
  try {
    verifyAppleIdToken(t, { audience: AUD, keys, now: NOW });
    return "accepted";
  } catch (err) {
    return err instanceof AppleTokenRejected ? err.code : "threw";
  }
}

describe("Sign in with Apple token check", () => {
  it("accepts a fresh token from Apple for this app and returns the Apple id and verified email", () => {
    expect(verifyAppleIdToken(token(), { audience: AUD, keys, now: NOW })).toEqual({ sub: "001234.abc", email: "anna@example.com" });
    expect(reason(token({ email_verified: true }))).toBe("accepted");
    expect(reason(token({ aud: [AUD] }))).toBe("accepted");
  });

  it("refuses a token not signed by Apple's key", () => {
    expect(reason(token({}, {}, other.privateKey))).toBe("bad_signature");
    const t = token().split(".");
    const forged = `${t[0]}.${b64({ iss: APPLE_ISSUER, aud: AUD, sub: "x", email: "victim@example.com", email_verified: true, iat: nowS, exp: nowS + 600 })}.${t[2]}`;
    expect(reason(forged)).toBe("bad_signature");
  });

  it("refuses other algorithms, unknown keys and garbage", () => {
    expect(reason(token({}, { alg: "none" }))).toBe("bad_alg");
    expect(reason(token({}, { alg: "HS256" }))).toBe("bad_alg");
    expect(reason(token({}, { kid: "nope" }))).toBe("unknown_key");
    for (const bad of [undefined, 42, "", "a.b", "a.b.c.d", "x".repeat(9000), "a.b.c"]) expect(reason(bad)).toBe("malformed");
  });

  it("refuses the wrong issuer or another app's token", () => {
    expect(reason(token({ iss: "https://evil.example" }))).toBe("bad_issuer");
    expect(reason(token({ aud: "com.other.app" }))).toBe("bad_audience");
    expect(reason(token({ aud: "com.berripop.signin" }))).toBe("bad_audience");
    expect(reason(token({ aud: [AUD, "com.other.app"] }))).toBe("bad_audience");
  });

  it("refuses expired, future-dated and old tokens", () => {
    expect(reason(token({ exp: nowS - 120 }))).toBe("expired");
    expect(reason(token({ iat: nowS + 600 }))).toBe("too_old");
    expect(reason(token({ iat: nowS - 3600, exp: nowS + 600 }))).toBe("too_old");
  });

  it("needs an Apple id and an email Apple has verified", () => {
    expect(reason(token({ sub: "" }))).toBe("no_subject");
    expect(reason(token({ email: undefined }))).toBe("no_email");
    expect(reason(token({ email: "not-an-email" }))).toBe("no_email");
    expect(reason(token({ email_verified: false }))).toBe("email_unverified");
    expect(reason(token({ email_verified: undefined }))).toBe("email_unverified");
  });

  it("reads the key id from the header", () => {
    expect(appleTokenKid(token())).toBe("k1");
    expect(appleTokenKid("garbage")).toBeNull();
  });

  it("the server side never logs the token and gives tickets that are short-lived", () => {
    const src = readFileSync("lib/server/nativeSignIn.ts", "utf8");
    expect(src).not.toMatch(/console\./);
    expect(src).toMatch(/TICKET_SECONDS = 120/);
    expect(src).toMatch(/verification\?\.status !== "verified"/);
  });

  it("checks Google tokens the same way: Google's issuer, our web or iOS client, the iOS client as the party", () => {
    const WEB = "240-web.apps.googleusercontent.com", IOS = "240-ios.apps.googleusercontent.com";
    const g = (claims: Record<string, unknown>) => {
      try {
        verifyIdToken(token({ iss: "https://accounts.google.com", aud: WEB, azp: IOS, email_verified: true, ...claims }), { issuers: GOOGLE_ISSUERS, audiences: [WEB, IOS], keys, now: NOW });
        return "accepted";
      } catch (err) {
        return err instanceof AppleTokenRejected ? err.code : "threw";
      }
    };
    expect(g({})).toBe("accepted");
    expect(g({ iss: "accounts.google.com" })).toBe("accepted");
    expect(g({ aud: IOS, azp: undefined })).toBe("accepted");
    expect(g({ aud: "999-other.apps.googleusercontent.com" })).toBe("bad_audience");
    expect(g({ azp: "999-other.apps.googleusercontent.com" })).toBe("bad_audience");
    expect(g({ iss: APPLE_ISSUER })).toBe("bad_issuer");
    expect(g({ email_verified: false })).toBe("email_unverified");
  });
});

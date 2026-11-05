import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { connect, constants, type ClientHttp2Session } from "node:http2";

/**
 * Minimal Apple Push Notification service client (token-based auth, HTTP/2),
 * using only Node's own modules. Configured by environment variables:
 * APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the .p8 key's text),
 * APNS_BUNDLE_ID (default com.berripop.app) and APNS_ENV ("production" for
 * TestFlight and App Store builds, anything else for Xcode builds).
 */

export type ApnsConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string; production: boolean };

export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_PRIVATE_KEY: key } = env;
  if (!keyId || !teamId || !key) return null;
  return {
    keyId, teamId,
    // Accept the key pasted with real line breaks or with "\n".
    privateKey: key.replace(/\\n/g, "\n"),
    bundleId: env.APNS_BUNDLE_ID || "com.berripop.app",
    production: env.APNS_ENV === "production",
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** The provider token: an ES256 JWT, valid for up to an hour. */
export function providerToken(c: ApnsConfig, now = Date.now()): string {
  const head = base64url(JSON.stringify({ alg: "ES256", kid: c.keyId }));
  const claims = base64url(JSON.stringify({ iss: c.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign("sha256", Buffer.from(`${head}.${claims}`), { key: createPrivateKey(c.privateKey), dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${base64url(signature)}`;
}

export type SendResult = { token: string; ok: boolean; status: number; reason?: string };

/** The device is gone for good (app deleted, token replaced): forget it. */
export function isDeadToken(r: SendResult): boolean {
  return r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"));
}

function sendOne(session: ClientHttp2Session, c: ApnsConfig, jwt: string, token: string, payload: string): Promise<SendResult> {
  return new Promise(resolve => {
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": c.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "5",
      // A reminder is only useful today: drop it if the phone is off for 6 hours.
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 6 * 3600),
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", h => { status = Number(h[constants.HTTP2_HEADER_STATUS]); });
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let reason: string | undefined;
      try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { /* not JSON */ }
      resolve({ token, ok: status === 200, status, reason });
    });
    req.on("error", () => resolve({ token, ok: false, status: 0, reason: "network" }));
    req.setTimeout(10_000, () => { req.close(); resolve({ token, ok: false, status: 0, reason: "timeout" }); });
    req.end(payload);
  });
}

/** Sends one alert to many devices over a single connection. */
export async function sendAlerts(c: ApnsConfig, tokens: string[], alert: { title: string; body: string }): Promise<SendResult[]> {
  if (!tokens.length) return [];
  const session = connect(c.production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com");
  session.on("error", () => { /* each request reports its own failure */ });
  try {
    const jwt = providerToken(c);
    const payload = JSON.stringify({ aps: { alert, sound: "default" } });
    const results: SendResult[] = [];
    // A few at a time: plenty for a daily reminder, gentle on the connection.
    for (let i = 0; i < tokens.length; i += 20) {
      results.push(...await Promise.all(tokens.slice(i, i + 20).map(t => sendOne(session, c, jwt, t, payload))));
    }
    return results;
  } finally {
    session.close();
  }
}

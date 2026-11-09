import { createHash } from "node:crypto";

/** One namespace for Berripop's account tokens (a random, fixed UUID). */
const TOKEN_NAMESPACE = "6f4b0c1e-8f7a-4d36-9a1c-3b5e2d7c9f10";

/**
 * The appAccountToken that ties a purchase to one Berripop account: a UUID
 * (version 5) derived from the account id, so it carries no personal data and
 * needs no storage. The app passes it to Apple when buying; Apple signs it
 * into the transaction, and the server only accepts a transaction whose
 * token matches the signed-in account.
 */
export function appAccountToken(userId: string): string {
  const ns = Buffer.from(TOKEN_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(userId, "utf8").digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

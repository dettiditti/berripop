import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { customType } from "drizzle-orm/pg-core";

/**
 * Application-level encryption at rest for members' private texts (journal,
 * answers, check-in notes, AI reflections on them). AES-256-GCM with a key
 * that only the server has (CONTENT_ENCRYPTION_KEY, 32 bytes, base64). The
 * server still decrypts for the owner, for shared circle answers and for AI
 * requests the member asks for, so this protects the stored data (a leaked
 * database or backup), not against the server itself: it is not end-to-end.
 *
 * Stored form: `enc:<keyId>:<iv>:<ciphertext+tag>` (base64url); keyId names the
 * key, so older keys (CONTENT_ENCRYPTION_OLD_KEYS, comma-separated) can still
 * read rows written before a rotation. Rows without the prefix are legacy
 * plaintext and are read as is until scripts/encrypt-content.ts converts them.
 *
 * Without a key, writes stay plaintext (as before this existed), but an
 * encrypted value can never be read: that fails with a clear error instead of
 * showing ciphertext. Once the key is set, it must never be removed.
 */

const ALGO = "aes-256-gcm";
/** Exactly what encryptText writes; anything else, even text starting with "enc:", is plaintext. */
const STORED = /^enc:([0-9a-f]{8}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22,})$/;

type Key = { id: string; key: Buffer };

function parseKey(raw: string): Key {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("Content encryption key must be 32 bytes, base64-encoded");
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

let cache: { src: string; active: Key | null; all: Map<string, Key> } | null = null;

function keys(env: Record<string, string | undefined> = process.env) {
  const src = `${env.CONTENT_ENCRYPTION_KEY ?? ""}|${env.CONTENT_ENCRYPTION_OLD_KEYS ?? ""}`;
  if (cache?.src === src) return cache;
  const active = env.CONTENT_ENCRYPTION_KEY ? parseKey(env.CONTENT_ENCRYPTION_KEY) : null;
  const all = new Map<string, Key>();
  for (const k of [active, ...(env.CONTENT_ENCRYPTION_OLD_KEYS ?? "").split(",").filter(s => s.trim()).map(parseKey)]) if (k) all.set(k.id, k);
  cache = { src, active, all };
  return cache;
}

export const isEncrypted = (value: string) => STORED.test(value);

/** Whether new writes are encrypted (a key is configured). */
export const contentEncryptionEnabled = () => keys().active !== null;

/** Encrypts with the active key; empty text and the no-key case stay as they are. */
export function encryptText(plain: string): string {
  const k = keys().active;
  if (!k || plain === "") return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, k.key, iv);
  const out = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `enc:${k.id}:${iv.toString("base64url")}:${out.toString("base64url")}`;
}

/** Decrypts a stored value; legacy plaintext passes through. Tampering or a missing key throws. */
export function decryptText(stored: string): string {
  const m = STORED.exec(stored);
  if (!m) return stored;
  const [, id, ivB64, dataB64] = m;
  const k = keys().all.get(id);
  if (!k) throw new Error("Encrypted content cannot be read: its CONTENT_ENCRYPTION_KEY is not configured");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(ALGO, k.key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}

/** A text column stored encrypted; same Postgres type, so no migration. */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  // Null stays null in nullable columns.
  toDriver: value => (value == null ? value : encryptText(value)),
  fromDriver: value => (value == null ? value : decryptText(value)),
});

/**
 * A jsonb column whose value is stored as one encrypted JSON string (still
 * valid jsonb, same type, so no migration). Legacy rows hold the plain JSON.
 */
export function encryptedJson<T>() {
  return customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: value => {
      const plain = JSON.stringify(value);
      return JSON.stringify(contentEncryptionEnabled() && value !== null ? encryptText(plain) : value);
    },
    fromDriver: value => {
      if (value == null) return value as T;
      // The driver may hand jsonb over parsed or as text.
      let v: unknown = value;
      if (typeof v === "string" && !isEncrypted(v)) {
        try { v = JSON.parse(v); } catch { return v as T; }
      }
      return (typeof v === "string" && isEncrypted(v) ? JSON.parse(decryptText(v)) : v) as T;
    },
  });
}

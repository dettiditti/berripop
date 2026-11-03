import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptText, encryptText, isEncrypted } from "../lib/db/encryption";
import { answers, dailyCheckins, growthInsights, journalEntries, journalReflections, worldMoments } from "../lib/db/schema";

/*
 * Encryption at rest for members' private texts: AES-256-GCM with a server
 * key, transparent through the schema columns, legacy plaintext still
 * readable, and an encrypted value never readable without its key.
 */

const KEY = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");
const SECRET = "Ma nagyon szorongtam a vizsga miatt.";

afterEach(() => vi.unstubAllEnvs());

describe("with a key", () => {
  it("round trips, and the stored form contains no plaintext", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const stored = encryptText(SECRET);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("szorong");
    expect(decryptText(stored)).toBe(SECRET);
  });

  it("encrypts the same text differently each time (random IV)", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    expect(encryptText(SECRET)).not.toBe(encryptText(SECRET));
  });

  it("detects tampering", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const stored = encryptText(SECRET);
    const last = stored.at(-2) === "A" ? "B" : "A";
    expect(() => decryptText(stored.slice(0, -2) + last + stored.at(-1))).toThrow();
  });

  it("legacy plaintext, empty text and text that merely starts with enc: are read as they are", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    expect(decryptText("régi, titkosítatlan bejegyzés")).toBe("régi, titkosítatlan bejegyzés");
    expect(encryptText("")).toBe("");
    expect(decryptText("enc: ez csak egy mondat")).toBe("enc: ez csak egy mondat");
    expect(decryptText(encryptText("enc:abc"))).toBe("enc:abc");
  });

  it("after a key rotation, rows written with the old key stay readable", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", OTHER);
    const old = encryptText(SECRET);
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CONTENT_ENCRYPTION_OLD_KEYS", OTHER);
    expect(decryptText(old)).toBe(SECRET);
  });

  it("rejects a key of the wrong length", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => encryptText(SECRET)).toThrow(/32 bytes/);
  });
});

describe("without the key", () => {
  it("new writes stay plaintext, as before encryption existed", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", "");
    expect(encryptText(SECRET)).toBe(SECRET);
  });

  it("an encrypted value is never shown: reading fails closed with a clear error and no content", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const stored = encryptText(SECRET);
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", "");
    expect(() => decryptText(stored)).toThrow(/CONTENT_ENCRYPTION_KEY is not configured/);
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", OTHER);
    let message = "";
    try { decryptText(stored); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/not configured/);
    expect(message).not.toContain("szorong");
  });
});

describe("schema columns", () => {
  it("text columns encrypt on the way in and decrypt on the way out", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const stored = answers.text.mapToDriverValue(SECRET) as string;
    expect(isEncrypted(stored)).toBe(true);
    expect(answers.text.mapFromDriverValue(stored)).toBe(SECRET);
    expect(answers.text.mapFromDriverValue("legacy answer")).toBe("legacy answer");
  });

  it("nullable columns keep null", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    expect(journalReflections.strength.mapToDriverValue(null as unknown as string)).toBeNull();
    expect(journalReflections.strength.mapFromDriverValue(null as unknown as string)).toBeNull();
  });

  it("jsonb columns store one encrypted JSON string and read legacy JSON too", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const alternatives = ["Fáradt voltál", "Sok volt a teendő"];
    const driver = journalReflections.alternatives.mapToDriverValue(alternatives) as string;
    const asJson = JSON.parse(driver) as string;
    expect(isEncrypted(asJson)).toBe(true);
    expect(driver).not.toContain("Fáradt");
    // The driver hands jsonb back parsed (a string here) or as text.
    expect(journalReflections.alternatives.mapFromDriverValue(asJson)).toEqual(alternatives);
    expect(journalReflections.alternatives.mapFromDriverValue(driver)).toEqual(alternatives);
    expect(journalReflections.alternatives.mapFromDriverValue(["régi"])).toEqual(["régi"]);
    expect(dailyCheckins.aiReply.mapToDriverValue(null)).toBe("null");
    expect(dailyCheckins.aiReply.mapFromDriverValue(null)).toBeNull();
  });

  it("every private text column is encrypted", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_KEY", KEY);
    const cols = [
      answers.text, answers.reflection, answers.reflectionPrompt, journalEntries.body,
      journalReflections.noticed, journalReflections.strength, journalReflections.explore, journalReflections.nextStep,
      journalReflections.suggestionText, journalReflections.correction, growthInsights.text, dailyCheckins.note, worldMoments.note,
    ];
    for (const c of cols) expect([c.name, isEncrypted(c.mapToDriverValue(SECRET) as string)]).toEqual([c.name, true]);
    for (const c of [journalReflections.alternatives, worldMoments.ownWords]) {
      expect([c.name, isEncrypted(JSON.parse(c.mapToDriverValue(["x"]) as string))]).toEqual([c.name, true]);
    }
  });
});

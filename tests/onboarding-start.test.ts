import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanStart, clearStart, readStart, resumeStep, saveStart } from "../lib/onboarding/start";
import { dictionaries } from "../lib/i18n/dictionaries";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

describe("phone app first answers (before sign-up)", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("keeps only known tap answers and a trimmed name, never free text", () => {
    const c = cleanStart({
      name: "  Anna  ",
      answers: { area: "stress", areaText: "secret", situation: "private words", obstacles: ["time", "nope"], time: "daily5", support: ["questions"], outcome: "x" },
    });
    expect(c).toEqual({ name: "Anna", answers: { area: "stress", obstacles: ["time"], time: "daily5", support: ["questions"] } });
  });

  it("ignores junk and empty data", () => {
    expect(cleanStart(null)).toBeNull();
    expect(cleanStart({ name: " ", answers: { area: "nope" } })).toBeNull();
    expect(cleanStart({ name: "x".repeat(80) })?.name).toHaveLength(40);
  });

  it("saves, reads back and clears", () => {
    saveStart({ name: "Bea", answers: { area: "habits", time: "weekly1" } }, 1000);
    expect(readStart(2000)).toEqual({ name: "Bea", answers: { area: "habits", time: "weekly1" } });
    clearStart();
    expect(readStart(2000)).toBeNull();
  });

  it("drops answers older than a week", () => {
    saveStart({ name: "Bea", answers: { area: "habits" } }, 0);
    expect(readStart(8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(storage.raw.size).toBe(0);
  });

  it("survives blocked or broken storage", () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } };
    expect(() => saveStart({ name: "A", answers: {} })).not.toThrow();
    expect(readStart()).toBeNull();
    expect(() => clearStart()).not.toThrow();
    storage.setItem("berripop.start.v1", "{not json");
    (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
    expect(readStart()).toBeNull();
  });

  it("continues the assessment at the first written question, or at the area when it needs words", () => {
    expect(resumeStep({ area: "confidence" })).toBe(1);
    expect(resumeStep({ area: "other" })).toBe(0);
    expect(resumeStep({})).toBe(0);
  });

  it("has every text in both languages", () => {
    for (const d of Object.values(dictionaries)) {
      expect(d.appStart.left).toContain("{n}");
      expect(d.appStart.readyTitle).toContain("{name}");
      expect(Object.keys(d.appStart.cheer).sort()).toEqual(["area", "obstacles", "support", "time"]);
    }
  });
});

describe("several areas before sign-up", () => {
  it("carries every picked area and resumes at the area question when something else is picked", () => {
    expect(cleanStart({ name: "A", answers: { areas: ["stress", "habits"] } })?.answers).toEqual({ area: "stress", areas: ["stress", "habits"] });
    expect(resumeStep({ areas: ["stress", "habits"], area: "stress" })).toBe(1);
    expect(resumeStep({ areas: ["stress", "other"], area: "stress" })).toBe(0);
  });
});

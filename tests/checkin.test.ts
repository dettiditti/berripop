import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKIN_NEEDS, CHECKIN_STATES, CHECKIN_TOPICS, cleanCheckin, responseKeys } from "../lib/checkin/checkin";
import { dailyCheckins } from "../lib/db/schema";
import { dictionaries } from "../lib/i18n/dictionaries";

/*
 * The daily check-in: every step optional, only known options kept, one row
 * per member per day, and nothing that touches XP, activity or streaks.
 * daily_checkins is an in-memory stand-in; nothing reaches Neon.
 */

type Row = Record<string, unknown> & { userId: string; date: string };
const rows: Row[] = [];
const touched: unknown[] = [];

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    insert: (t: unknown) => ({
      values: (v: Row) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (t !== dailyCheckins) touched.push(t);
          const i = rows.findIndex(r => r.userId === v.userId && r.date === v.date);
          if (i >= 0) rows[i] = { ...rows[i], ...set };
          else rows.push({ ...v, aiReply: null });
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async () => {
        if (t !== dailyCheckins) touched.push(t);
        rows.length = 0;
      },
    }),
  }),
}));
vi.mock("../lib/server/snapshot", () => ({ loadSnapshot: async () => ({ progress: {} }) }));

const { saveCheckin, deleteCheckin } = await import("../lib/server/checkin");

beforeEach(() => {
  rows.length = 0;
  touched.length = 0;
});

describe("cleaning input", () => {
  it("keeps known options, at most three distinct topics, and a short note", () => {
    const c = cleanCheckin({ state: "tired", topics: ["work", "work", "bogus", "family", "money", "health"], note: `  ${"a".repeat(600)} `, need: "listen" });
    expect(c).toEqual({ state: "tired", topics: ["work", "family", "money"], note: "a".repeat(500), need: "listen" });
  });

  it("every step can be skipped on its own", () => {
    expect(cleanCheckin({ state: "calm" })).toEqual({ state: "calm", topics: [], note: "", need: null });
    expect(cleanCheckin({ topics: ["self"] })).toMatchObject({ state: null, topics: ["self"] });
    expect(cleanCheckin({ need: "note" })).toMatchObject({ state: null, need: "note" });
    expect(cleanCheckin({ note: "just this" })).toMatchObject({ note: "just this" });
  });

  it("is nothing at all when everything was skipped or unknown", () => {
    expect(cleanCheckin({})).toBeNull();
    expect(cleanCheckin({ state: "ecstatic", topics: "work", note: "   ", need: 3 })).toBeNull();
  });
});

describe("prepared answers", () => {
  for (const locale of ["hu", "en"] as const) {
    it(`${locale}: there is copy for every state, topic, need and the skipped case`, () => {
      const c = dictionaries[locale].checkin;
      for (const s of CHECKIN_STATES) expect(c.states[s] && c.responses.state[s]).toBeTruthy();
      for (const t of CHECKIN_TOPICS) expect(c.topics[t]).toBeTruthy();
      for (const n of CHECKIN_NEEDS) expect(c.needs[n] && c.responses.need[n]).toBeTruthy();
      expect(c.responses.state.none && c.responses.need.none).toBeTruthy();
    });
  }

  it("falls back to the skipped case", () => {
    expect(responseKeys({ state: null, need: null })).toEqual({ state: "none", need: "none" });
    expect(responseKeys({ state: "sad", need: "practical" })).toEqual({ state: "sad", need: "practical" });
  });
});

describe("saving", () => {
  it("one row per member per day: saving again replaces it and drops an old AI follow-up", async () => {
    expect((await saveCheckin("u", { state: "tense", topics: ["work"] })).ok).toBe(true);
    rows[0].aiReply = { heard: "x", question: "y?", idea: null };
    expect((await saveCheckin("u", { state: "calm" })).ok).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u", state: "calm", topics: [], aiReply: null });
    expect(rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses an empty check-in without writing anything", async () => {
    expect(await saveCheckin("u", {})).toEqual({ ok: false, error: "invalid" });
    expect(rows).toHaveLength(0);
  });

  it("never writes XP, activity or any other table (streaks stay as they are)", async () => {
    await saveCheckin("u", { state: "good", need: "note" });
    await deleteCheckin("u");
    expect(touched).toEqual([]);
  });
});

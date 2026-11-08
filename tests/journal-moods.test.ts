import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalEntries, journalMoods } from "../lib/db/schema";
import { isMood, MOODS } from "../lib/journal/moods";

/*
 * Feeling stickers on journal entries: only the owner's entry, only known
 * moods, cleared with null, never tracked, and the journal keeps working
 * before the journal_moods migration has run (the table is missing).
 */

type Entry = { id: string; userId: string; body: string; status: "draft" | "saved"; entryDate: string; createdAt: Date; updatedAt: Date };
let entries: Entry[] = [];
let moods: Map<string, { userId: string; mood: string }> | null = new Map();
const tracked: unknown[] = [];
let currentUser = "user_a";

const missing = () => Object.assign(new Error("relation \"journal_moods\" does not exist"), { cause: { code: "42P01" } });

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === journalMoods) {
            if (!moods) return Promise.reject(missing());
            return Promise.resolve([...moods].filter(([, v]) => v.userId === currentUser).map(([entryId, v]) => ({ entryId, mood: v.mood })));
          }
          const own = table === journalEntries ? entries.filter(e => e.userId === currentUser) : [];
          return { limit: async () => own.slice(0, 1), orderBy: async () => own };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: { entryId: string; userId: string; mood: string }) => ({
        onConflictDoUpdate: async () => {
          if (table !== journalMoods) throw new Error("unexpected insert");
          if (!moods) throw missing();
          moods.set(v.entryId, { userId: v.userId, mood: v.mood });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table !== journalMoods) throw new Error("unexpected delete");
        if (!moods) throw missing();
        for (const [k, v] of moods) if (v.userId === currentUser) moods.delete(k);
      },
    }),
  }),
}));
vi.mock("../lib/server/progress", () => ({ grantGrowthXp: async () => 0 }));
vi.mock("../lib/server/analytics", () => ({ track: async (...a: unknown[]) => void tracked.push(a) }));
vi.mock("../lib/server/entitlements", () => ({
  getAiUsage: async () => ({ used: 0, limit: 3, remaining: 3, reached: false, resets: new Date().toISOString() }),
  getUserEntitlements: async () => ({ limits: { weeklyJournal: false, insightContext: false } }),
  canAccessWeeklyJournal: async () => false,
}));
vi.mock("../lib/server/ai", () => ({ aiConfigured: () => true, runMeteredAi: async () => ({ ok: false, error: "ai_unavailable" }) }));

const { loadJournal, setEntryMood } = await import("../lib/server/journal");

const entry = (id: string, userId: string): Entry => ({ id, userId, body: "Egy nap a tónál.", status: "saved", entryDate: "2026-11-08", createdAt: new Date(), updatedAt: new Date() });

beforeEach(() => {
  entries = [entry("e1", "user_a"), entry("e2", "user_b")];
  moods = new Map();
  tracked.length = 0;
  currentUser = "user_a";
});

describe("feeling stickers", () => {
  it("knows exactly the seven moods", () => {
    expect(MOODS).toHaveLength(7);
    expect(isMood("boldog")).toBe(true);
    expect(isMood("ecstatic")).toBe(false);
    expect(isMood(null)).toBe(false);
  });

  it("pins a mood on the owner's entry and shows it in the journal", async () => {
    const res = await setEntryMood("user_a", "e1", "nyugodt");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.moodsEnabled).toBe(true);
    expect(res.state.entries.find(e => e.id === "e1")?.mood).toBe("nyugodt");
  });

  it("null clears the sticker", async () => {
    await setEntryMood("user_a", "e1", "merges");
    const res = await setEntryMood("user_a", "e1", null);
    expect(res.ok && res.state.entries[0].mood).toBe(null);
  });

  it("refuses unknown moods and other people's entries", async () => {
    expect(await setEntryMood("user_a", "e1", "ecstatic")).toEqual({ ok: false, error: "invalid" });
    expect(await setEntryMood("user_a", "e1", 3)).toEqual({ ok: false, error: "invalid" });
    entries = [entry("e2", "user_b")];
    expect(await setEntryMood("user_a", "e2", "boldog")).toEqual({ ok: false, error: "not_found" });
    expect(moods?.size).toBe(0);
  });

  it("is never tracked", async () => {
    await setEntryMood("user_a", "e1", "szomoru");
    expect(tracked).toEqual([]);
  });

  it("before the migration: the journal loads with stickers off, and saving one fails softly", async () => {
    moods = null;
    const state = await loadJournal("user_a");
    expect(state.moodsEnabled).toBe(false);
    expect(state.entries[0].mood).toBe(null);
    expect(await setEntryMood("user_a", "e1", "boldog")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("weekMoods", () => {
  it("takes the latest entry with a sticker per day, oldest day first", async () => {
    const { weekMoods } = await import("../lib/journal/moods");
    const days = ["2026-11-06", "2026-11-07", "2026-11-08"];
    const entries = [
      { entryDate: "2026-11-08", mood: null },
      { entryDate: "2026-11-08", mood: "boldog" as const },
      { entryDate: "2026-11-06", mood: "faradt" as const },
    ];
    expect(weekMoods(entries, days)).toEqual(["faradt", null, "boldog"]);
  });
});

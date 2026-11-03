import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalEntries } from "../lib/db/schema";

/*
 * Server side of saving a journal entry: XP and the "finished" event only for
 * a saved entry, named by the entry so the database grants XP once, and the
 * save-flow events never carry the text. The database is an in-memory stand-in.
 */

type Row = { id: string; userId: string; body: string; status: "draft" | "saved"; entryDate: string; createdAt: Date; updatedAt: Date };
let rows: Row[] = [];
const xp: unknown[][] = [];
const tracked: unknown[][] = [];

vi.mock("server-only", () => ({}));
vi.mock("../lib/db", () => ({
  getDb: () => ({
    select: (fields?: unknown) => ({
      from: (table: unknown) => ({
        where: () => {
          const own = table === journalEntries ? rows : [];
          // select({ id }) is the "any saved entry yet?" check; select() reads the entry itself.
          const hit = fields ? own.filter(r => r.status === "saved") : own;
          return { limit: async () => hit.slice(0, 1), orderBy: async () => own };
        },
      }),
    }),
    update: () => ({ set: (v: Partial<Row>) => ({ where: async () => void Object.assign(rows[0], v) }) }),
    insert: () => ({
      values: (v: Omit<Row, "id" | "createdAt" | "updatedAt">) => ({
        returning: async () => {
          const r = { ...v, id: `entry_${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
          rows.push(r);
          return [{ id: r.id }];
        },
      }),
    }),
  }),
}));
vi.mock("../lib/server/progress", () => ({ grantGrowthXp: async (...a: unknown[]) => (xp.push(a), 10) }));
vi.mock("../lib/server/analytics", () => ({ track: async (...a: unknown[]) => void tracked.push(a) }));
vi.mock("../lib/server/entitlements", () => ({
  getAiUsage: async () => ({ used: 0, limit: 3, remaining: 3, reached: false, resets: new Date().toISOString() }),
  getUserEntitlements: async () => ({ limits: { weeklyJournal: false, insightContext: false } }),
  canAccessWeeklyJournal: async () => false,
}));
vi.mock("../lib/server/ai", () => ({ aiConfigured: () => true, runMeteredAi: async () => ({ ok: false, error: "ai_unavailable" }) }));

const { entrySaveEvents, saveEntry } = await import("../lib/server/journal");
const events = () => tracked.map(t => t[1]);

beforeEach(() => {
  rows = [];
  xp.length = tracked.length = 0;
});

describe("entrySaveEvents", () => {
  it("a new draft starts the flow; an entry is finished once", () => {
    expect(entrySaveEvents(null, "draft")).toEqual(["journal_draft_started"]);
    expect(entrySaveEvents(null, "saved")).toEqual(["journal_final_save_succeeded"]);
    expect(entrySaveEvents("draft", "draft")).toEqual([]);
    expect(entrySaveEvents("draft", "saved")).toEqual(["journal_final_save_succeeded"]);
    expect(entrySaveEvents("saved", "saved")).toEqual([]);
  });
});

describe("saveEntry", () => {
  it("draft, then final save: XP and the finished event only at the final save", async () => {
    const draft = await saveEntry("user_a", { body: "Ma sokat gondolkodtam.", status: "draft" });
    expect(draft.ok).toBe(true);
    expect(xp).toEqual([]);
    expect(events()).toEqual(["journal_draft_started"]);

    const id = draft.ok ? draft.data! : "";
    await saveEntry("user_a", { id, body: "Ma sokat gondolkodtam, és lezártam.", status: "saved" });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("saved");
    expect(xp).toEqual([["user_a", "journal", id]]);
    expect(events()).toEqual(["journal_draft_started", "first_entry_saved", "journal_final_save_succeeded"]);
  });

  it("saving the same entry again names the same entry for XP (the database grants it once) and is not finished twice", async () => {
    const r = await saveEntry("user_a", { body: "Első mentett bejegyzés", status: "saved" });
    const id = r.ok ? r.data! : "";
    await saveEntry("user_a", { id, body: "Első mentett bejegyzés, javítva", status: "saved" });
    expect(xp).toEqual([["user_a", "journal", id], ["user_a", "journal", id]]);
    expect(events().filter(e => e === "journal_final_save_succeeded")).toHaveLength(1);
    expect(events().filter(e => e === "first_entry_saved")).toHaveLength(1);
  });

  it("autosaving a draft again adds no events and no XP", async () => {
    const r = await saveEntry("user_a", { body: "Piszkozat", status: "draft" });
    await saveEntry("user_a", { id: r.ok ? r.data : null, body: "Piszkozat, hosszabban", status: "draft" });
    expect(events()).toEqual(["journal_draft_started"]);
    expect(xp).toEqual([]);
  });

  it("a final save that is too short is refused: nothing stored, no XP, no event", async () => {
    expect(await saveEntry("user_a", { body: "ok", status: "saved" })).toEqual({ ok: false, error: "invalid" });
    expect(rows).toEqual([]);
    expect(xp).toEqual([]);
    expect(events()).toEqual([]);
  });

  it("events carry the member and the event name only, never the text", async () => {
    const r = await saveEntry("user_a", { body: "Nagyon személyes gondolat", status: "draft" });
    await saveEntry("user_a", { id: r.ok ? r.data : null, body: "Nagyon személyes gondolat, kész", status: "saved" });
    for (const t of tracked) {
      expect(t).toHaveLength(2);
      expect(JSON.stringify(t)).not.toMatch(/személyes/);
    }
  });
});

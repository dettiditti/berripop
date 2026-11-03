import { describe, expect, it, vi } from "vitest";
import { createEntrySaver, saveStatusText, type EditorEvent, type SaveStatus } from "../lib/journal/editor-save";
import type { JournalResult, JournalState } from "../lib/journal/types";
import { hu } from "../lib/i18n/dictionaries/hu";
vi.mock("server-only", () => ({}));
const { FUNNEL_EVENTS } = await import("../lib/server/analytics");

/*
 * The journal editor's save lifecycle: drafts autosave, only the final save
 * makes a finished entry, requests never overlap, and closing never loses
 * text silently. The server is an in-memory stand-in.
 */

const STATE = { entries: [] } as unknown as JournalState;
type Call = { id: string | null; body: string; status: "draft" | "saved" };

function setup(opts: { entry?: { id: string; body: string; status: "draft" | "saved" } | null; fail?: () => boolean; slow?: boolean } = {}) {
  const calls: Call[] = [];
  const statuses: SaveStatus[] = [];
  const events: unknown[][] = [];
  let next = 1;
  const pending: (() => void)[] = [];
  const saver = createEntrySaver({
    entry: opts.entry ?? null,
    save: async input => {
      calls.push({ ...input });
      if (opts.slow) await new Promise<void>(r => pending.push(r));
      if (opts.fail?.()) return { ok: false, error: "invalid" } as JournalResult<string>;
      return { ok: true, state: STATE, data: input.id ?? `entry_${next++}` };
    },
    track: (...args: unknown[]) => void events.push(args),
    onStatus: s => void statuses.push(s),
    onState: () => {},
  });
  // Lets every queued request through, one after another.
  const release = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 0));
      while (pending.length) pending.shift()!();
    }
  };
  const last = () => statuses[statuses.length - 1];
  const names = () => events.map(e => e[0] as EditorEvent);
  return { saver, calls, statuses, events, names, last, release };
}

describe("draft autosave", () => {
  it("stores the text as a draft and says so, without claiming the entry is finished", async () => {
    const s = setup();
    await s.saver.autosave("Ma sokat sétáltam.");
    expect(s.calls).toEqual([{ id: null, body: "Ma sokat sétáltam.", status: "draft" }]);
    expect(s.last()).toBe("draft_saved");
    expect(saveStatusText("draft_saved", hu.journal)).toBe("Piszkozat automatikusan mentve");
    expect(s.saver.final).toBe(false);
  });

  it("the next autosave updates the same draft; unchanged text is not sent again", async () => {
    const s = setup();
    await s.saver.autosave("Első gondolat");
    await s.saver.autosave("Első gondolat");
    await s.saver.autosave("Első gondolat, folytatva");
    expect(s.calls.map(c => c.id)).toEqual([null, "entry_1"]);
  });

  it("a couple of characters never create a new draft", async () => {
    const s = setup();
    await s.saver.autosave("a");
    await s.saver.autosave("  ");
    expect(s.calls).toEqual([]);
  });

  it("slow requests never overlap, so a slow first save can't create a second entry", async () => {
    const s = setup({ slow: true });
    const a = s.saver.autosave("Első változat");
    const b = s.saver.autosave("Második változat");
    const f = s.saver.finish("Végleges változat");
    await s.release();
    await Promise.all([a, b, f]);
    expect(s.calls.map(c => c.id)).toEqual([null, "entry_1", "entry_1"]);
    expect(s.calls.at(-1)).toEqual({ id: "entry_1", body: "Végleges változat", status: "saved" });
  });

  it("restores an existing draft: saves go to that draft", async () => {
    const s = setup({ entry: { id: "draft_9", body: "Tegnapi piszkozat", status: "draft" } });
    await s.saver.autosave("Tegnapi piszkozat, ma folytatva");
    expect(s.calls).toEqual([{ id: "draft_9", body: "Tegnapi piszkozat, ma folytatva", status: "draft" }]);
  });

  it("edits of a saved entry stay saved and are called changes, not a draft", async () => {
    const s = setup({ entry: { id: "e1", body: "Kész bejegyzés", status: "saved" } });
    await s.saver.autosave("Kész bejegyzés, javítva");
    expect(s.calls[0].status).toBe("saved");
    expect(s.last()).toBe("changes_saved");
    expect(await s.saver.close("Kész bejegyzés, javítva")).toBe("closed");
    expect(s.names()).toEqual([]);
  });
});

describe("closing the editor", () => {
  it("unsaved text is stored as a draft on close, and the person is told it stays", async () => {
    const s = setup();
    expect(await s.saver.close("Félbehagyott gondolat")).toBe("kept_draft");
    expect(s.calls).toEqual([{ id: null, body: "Félbehagyott gondolat", status: "draft" }]);
    expect(s.names()).toContain("journal_editor_closed_with_draft");
  });

  it("an already autosaved draft is not sent again on close", async () => {
    const s = setup();
    await s.saver.autosave("Megvan már");
    expect(await s.saver.close("Megvan már")).toBe("kept_draft");
    expect(s.calls).toHaveLength(1);
  });

  it("nothing meaningful written: closes without creating a draft", async () => {
    const s = setup();
    expect(await s.saver.close("")).toBe("closed");
    expect(await setup().saver.close("ok")).toBe("closed");
    expect(s.calls).toEqual([]);
  });

  it("when the draft can't be stored, the editor stays open once and says why; a second close closes", async () => {
    const s = setup({ fail: () => true });
    expect(await s.saver.close("Fontos szöveg")).toBe("kept_open");
    expect(s.last()).toBe("close_error");
    expect(saveStatusText("close_error", hu.journal)).toMatch(/nyitva hagytuk/);
    expect(await s.saver.close("Fontos szöveg")).toBe("closed");
    expect(s.names()).not.toContain("journal_editor_closed_with_draft");
  });
});

describe("final save", () => {
  it("only the server's confirmation shows success", async () => {
    const s = setup({ slow: true });
    const p = s.saver.finish("Ma megköszöntem valakinek.");
    expect(s.last()).toBe("finishing");
    expect(s.saver.final).toBe(false);
    await s.release();
    expect(await p).toBe(true);
    expect(s.calls).toEqual([{ id: null, body: "Ma megköszöntem valakinek.", status: "saved" }]);
    expect(s.last()).toBe("final_saved");
    expect(s.saver.final).toBe(true);
    expect(hu.journal.afterSaveTitle).toBe("Bejegyzés sikeresen elmentve!");
    expect(hu.journal.finishing).toBe("Mentés...");
  });

  it("a failed save keeps the person in the editor with an error, and a retry saves the same entry", async () => {
    let failing = true;
    const s = setup({ fail: () => failing });
    expect(await s.saver.finish("Nem akarom elveszíteni")).toBe(false);
    expect(s.last()).toBe("error");
    expect(saveStatusText("error", hu.journal)).toMatch(/szöveged megvan/);
    expect(s.saver.final).toBe(false);
    failing = false;
    expect(await s.saver.finish("Nem akarom elveszíteni")).toBe(true);
    expect(s.last()).toBe("final_saved");
    expect(s.names().filter(n => n === "journal_final_save_failed")).toHaveLength(1);
  });

  it("double taps send one request", async () => {
    const s = setup({ slow: true });
    const a = s.saver.finish("Egyszer elég");
    const b = s.saver.finish("Egyszer elég");
    await s.release();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(await s.saver.finish("Egyszer elég")).toBe(true);
    expect(s.calls).toHaveLength(1);
  });

  it("too short text is not sent", async () => {
    const s = setup();
    expect(await s.saver.finish("ok")).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it("after the final save, nothing autosaves and closing just closes (no AI request is made here)", async () => {
    const s = setup();
    await s.saver.finish("Kész is van");
    await s.saver.autosave("Kész is van, de még gépel");
    expect(await s.saver.close("Kész is van")).toBe("closed");
    expect(s.calls).toHaveLength(1);
    expect(saveStatusText("final_saved", hu.journal)).toBe("");
  });

  it("closing while the final save runs waits for it instead of storing a draft", async () => {
    const s = setup({ slow: true });
    const f = s.saver.finish("Mentés közben bezár");
    const c = s.saver.close("Mentés közben bezár");
    await s.release();
    await f;
    expect(await c).toBe("closed");
    expect(s.calls.map(x => x.status)).toEqual(["saved"]);
  });
});

describe("events", () => {
  it("carry only an allowlisted name: never text, and each at most once per editor session", async () => {
    let failing = true;
    const s = setup({ fail: () => failing });
    await s.saver.finish("Titkos gondolat egy");
    failing = false;
    await s.saver.autosave("Titkos gondolat kettő");
    await s.saver.autosave("Titkos gondolat három");
    await s.saver.finish("Titkos gondolat négy");
    for (const e of s.events) {
      expect(e).toHaveLength(1);
      expect(FUNNEL_EVENTS).toContain(e[0]);
      expect(JSON.stringify(e)).not.toMatch(/Titkos/);
    }
    expect(new Set(s.names()).size).toBe(s.names().length);
  });
});

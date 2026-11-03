import type { JournalResult, JournalState } from "./types";

/**
 * The journal editor's save lifecycle, kept apart from React so it can be
 * tested. Drafts autosave; only the explicit final save turns an entry into a
 * saved one. Requests run one at a time, so a later save always knows the id
 * the first one created (no duplicate entries), and a second tap on "save"
 * joins the request already running. Events carry a name only, never text.
 */

/** Same minimum as the server's final save; shorter text never becomes a new draft either. */
export const MIN_ENTRY_CHARS = 3;

export type SaveStatus =
  | "idle"
  | "saving" // a draft (or the edits of a saved entry) is being stored
  | "finishing" // the final save is running
  | "draft_saved"
  | "changes_saved" // edits of an already saved entry
  | "final_saved" // confirmed by the server
  | "error"
  | "close_error"; // the draft could not be stored on close, so the editor stayed open

export type EditorEvent =
  | "journal_draft_autosaved"
  | "journal_final_save_clicked"
  | "journal_final_save_failed"
  | "journal_editor_closed_with_draft";

/** "kept_draft": the text stays in the journal as a draft; "kept_open": closing was stopped to keep the text. */
export type CloseOutcome = "closed" | "kept_draft" | "kept_open";

type SaveInput = { id: string | null; body: string; status: "draft" | "saved" };

export type EntrySaver = ReturnType<typeof createEntrySaver>;

export function createEntrySaver(opts: {
  entry: { id: string; body: string; status: "draft" | "saved" } | null;
  save: (input: SaveInput) => Promise<JournalResult<string>>;
  /** Each event at most once per editor session, so rerenders and retries don't count twice. */
  track: (event: EditorEvent) => void;
  onStatus: (status: SaveStatus) => void;
  onState: (state: JournalState) => void;
}) {
  let id = opts.entry?.id ?? null;
  const wasSaved = opts.entry?.status === "saved";
  // What the server holds; null when nothing is stored yet.
  let stored: string | null = opts.entry?.body ?? null;
  let final = false;
  let lastFailed = false;
  let closeWarned = false;
  let finishing: Promise<boolean> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const sent = new Set<EditorEvent>();
  const once = (e: EditorEvent) => {
    if (sent.has(e)) return;
    sent.add(e);
    opts.track(e);
  };
  const set = (s: SaveStatus) => opts.onStatus(s);

  // An existing entry may be shortened freely; a new one is only created once there is something to keep.
  const worthKeeping = (body: string) => (id ? body.trim().length > 0 : body.trim().length >= MIN_ENTRY_CHARS);

  function persist(body: string, next: "draft" | "saved"): Promise<boolean> {
    const run = queue.then(async () => {
      try {
        // Editing an already-saved entry never turns it back into a draft.
        const r = await opts.save({ id, body, status: next === "saved" || wasSaved ? "saved" : "draft" });
        if (!r.ok) return false;
        if (r.data) id = r.data;
        stored = body;
        opts.onState(r.state);
        return true;
      } catch {
        return false;
      }
    });
    queue = run;
    return run.then(ok => ((lastFailed = !ok), ok));
  }

  async function autosave(body: string): Promise<void> {
    if (final || finishing || body === stored || !worthKeeping(body)) return;
    set("saving");
    const ok = await persist(body, "draft");
    if (final || finishing) return; // the final save took over
    if (!ok) return set("error");
    set(wasSaved ? "changes_saved" : "draft_saved");
    if (!wasSaved) once("journal_draft_autosaved");
  }

  function finish(body: string): Promise<boolean> {
    if (final) return Promise.resolve(true);
    if (finishing) return finishing;
    if (body.trim().length < MIN_ENTRY_CHARS) return Promise.resolve(false);
    once("journal_final_save_clicked");
    set("finishing");
    finishing = persist(body, "saved").then(ok => {
      finishing = null;
      if (ok) {
        final = true;
        set("final_saved");
      } else {
        set("error");
        once("journal_final_save_failed");
      }
      return ok;
    });
    return finishing;
  }

  async function close(body: string): Promise<CloseOutcome> {
    if (finishing) await finishing;
    if (final) return "closed";
    if (body !== stored && worthKeeping(body)) {
      set("saving");
      const ok = await persist(body, "draft");
      if (!ok && !closeWarned) {
        // Never lose the text silently: stay open once and say so; a second close means "close anyway".
        closeWarned = true;
        set("close_error");
        return "kept_open";
      }
    } else {
      await queue;
    }
    if (id && !wasSaved && !lastFailed) {
      once("journal_editor_closed_with_draft");
      return "kept_draft";
    }
    return "closed";
  }

  return {
    autosave,
    finish,
    close,
    get id() {
      return id;
    },
    get final() {
      return final;
    },
  };
}

/** The editor's status line. The final save has its own confirmation screen, so it shows nothing here. */
export function saveStatusText(
  status: SaveStatus,
  j: { saving: string; draftSaved: string; changesSaved: string; saveError: string; closeError: string },
): string {
  switch (status) {
    case "saving":
    case "finishing":
      return j.saving;
    case "draft_saved":
      return j.draftSaved;
    case "changes_saved":
      return j.changesSaved;
    case "error":
      return j.saveError;
    case "close_error":
      return j.closeError;
    default:
      return "";
  }
}

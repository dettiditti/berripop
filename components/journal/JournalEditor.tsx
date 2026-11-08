"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Lightbulb, Lock, Sparkles, X } from "lucide-react";
import type { JournalEntryDTO, JournalState } from "@/lib/journal/types";
import { createEntrySaver, MIN_ENTRY_CHARS, saveStatusText, type SaveStatus } from "@/lib/journal/editor-save";
import { useI18n } from "@/lib/i18n/client";
import { saveJournalEntryAction, trackAction } from "@/lib/server/actions";
import { MoodPicker } from "./MoodSticker";

/**
 * Distraction-free writer. Drafts autosave shortly after typing stops; only
 * "save entry" makes it a finished entry, confirmed by the server. Nothing is
 * sent to AI from here. After saving, the owner chooses whether to ask for a
 * reflection or go back to the journal.
 */
export default function JournalEditor({
  entry,
  state,
  onState,
  onClose,
  onReflect,
  insightToggle,
  initialBody,
}: {
  entry: JournalEntryDTO | null;
  state: JournalState;
  onState: (s: JournalState) => void;
  /** `keptDraft`: the text stays in the journal as an unfinished draft. */
  onClose: (keptDraft: boolean) => void;
  onReflect: (entryId: string) => void;
  /** Optional opt-in for including saved insights in this reflection request. */
  insightToggle?: ReactNode;
  /** Text to start a new entry with, e.g. a guided first-exercise question. */
  initialBody?: string;
}) {
  const { d, t, plural, date } = useI18n();
  const j = d.journal;
  const [body, setBody] = useState(entry?.body ?? initialBody ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [showPrompts, setShowPrompts] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const dirty = useRef(false);
  const closing = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);
  const [saver] = useState(() => createEntrySaver({
    entry,
    save: saveJournalEntryAction,
    track: event => void trackAction(event),
    onStatus: setStatus,
    onState: s => onStateRef.current(s),
  }));
  const done = status === "final_saved";

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  // Fit the editor to the visible viewport, so the on-screen keyboard never covers the save button.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = rootRef.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.setProperty("--editor-height", `${vv.height}px`);
      el.style.setProperty("--editor-top", `${vv.offsetTop}px`);
      setKeyboard(window.innerHeight - vv.height > 120);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  // Autosave drafts ~1.5s after typing stops.
  useEffect(() => {
    if (!dirty.current || done) return;
    const timer = window.setTimeout(() => void saver.autosave(body), 1500);
    return () => window.clearTimeout(timer);
  }, [body, done, saver]);

  async function close() {
    if (closing.current) return;
    closing.current = true;
    const outcome = await saver.close(body);
    closing.current = false;
    if (outcome !== "kept_open") onClose(outcome === "kept_draft");
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const finishing = status === "finishing";
  const canReflect = state.aiConfigured && !state.usage.reached && !!saver.id;

  return (
    <div ref={rootRef} className="overlay journal-editor" data-keyboard={keyboard || undefined} role="dialog" aria-modal="true" aria-label={j.editorLabel}>
      <header className="quest-flow-top">
        <button className="icon-btn" onClick={close} aria-label={j.close}><X size={22} /></button>
        <span className={`journal-status ${status === "error" || status === "close_error" ? "is-error" : ""}`} aria-live="polite">{saveStatusText(status, j)}</span>
        <span className="tag"><Lock size={12} /> {j.privateBadge}</span>
      </header>

      {!done ? (
        <>
          <div className="journal-editor-body">
            <label className="sr-only" htmlFor="journal-body">{j.editorLabel}</label>
            <textarea
              id="journal-body"
              ref={textRef}
              className="journal-textarea"
              value={body}
              placeholder={j.placeholder}
              maxLength={20000}
              onChange={e => { setBody(e.target.value); dirty.current = true; }}
            />
            <div className="journal-tools">
              <button type="button" className="btn btn--text btn--inline" aria-expanded={showPrompts} onClick={() => setShowPrompts(v => !v)}><Lightbulb size={15} /> {j.promptsTitle}</button>
              <small className="muted tabular">{plural(j.words, words)}</small>
            </div>
            {showPrompts && (
              <div className="chip-row journal-prompts">
                {j.prompts.map(p => (
                  <button key={p} type="button" className="chip" onClick={() => { setBody(b => (b.trim() ? `${b.trimEnd()}\n\n${p}\n` : `${p}\n`)); dirty.current = true; textRef.current?.focus(); }}>{p}</button>
                ))}
              </div>
            )}
            {body.length > 0 && body.trim().length < MIN_ENTRY_CHARS && <p className="field-hint">{j.tooShort}</p>}
          </div>
          <div className="journal-editor-actions">
            <button className="btn btn--primary btn--lg btn--block" disabled={body.trim().length < MIN_ENTRY_CHARS || finishing} aria-busy={finishing} onClick={() => void saver.finish(body)}>
              <Check size={18} /> {finishing ? j.finishing : j.finish}
            </button>
          </div>
        </>
      ) : (
        <div className="journal-editor-body journal-after" role="status">
          <h2>{j.afterSaveTitle}</h2>
          <p className="muted">{j.afterSaveBody}</p>
          {state.moodsEnabled && saver.id && (
            <MoodPicker entryId={saver.id} value={state.entries.find(e => e.id === saver.id)?.mood ?? null} onResult={res => { if (res.ok) onState(res.state); return res.ok; }} />
          )}
          {canReflect && (
            <>
              {insightToggle}
              <button className="btn btn--primary btn--block" onClick={() => saver.id && onReflect(saver.id)}><Sparkles size={16} /> {j.afterSaveReflect}</button>
              <small className="muted">{plural(j.reflectRemaining, state.usage.remaining)} · {j.reflectDisclosure}</small>
            </>
          )}
          {state.usage.reached && <p className="muted">{t(j.limitReached, { date: date(state.usage.resets) })}</p>}
          <button className="btn btn--ghost btn--block" onClick={() => onClose(false)}>{j.backToJournal}</button>
        </div>
      )}
    </div>
  );
}

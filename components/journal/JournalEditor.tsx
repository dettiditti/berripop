"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Lightbulb, Lock, Sparkles, X } from "lucide-react";
import type { JournalEntryDTO, JournalResult, JournalState } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import { saveJournalEntryAction } from "@/lib/server/actions";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Distraction-free writer. Drafts autosave shortly after typing stops; nothing
 * is sent to AI from here. After saving, the owner chooses whether to ask for
 * a reflection or keep the entry private.
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
  onClose: () => void;
  onReflect: (entryId: string) => void;
  /** Optional opt-in for including saved insights in this reflection request. */
  insightToggle?: ReactNode;
  /** Text to start a new entry with, e.g. a guided first-exercise question. */
  initialBody?: string;
}) {
  const { d, t, plural, date } = useI18n();
  const j = d.journal;
  const [id, setId] = useState<string | null>(entry?.id ?? null);
  const [body, setBody] = useState(entry?.body ?? initialBody ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const dirty = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const saving = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function persist(next: "draft" | "saved"): Promise<JournalResult<string> | null> {
    setStatus("saving");
    try {
      // Editing an already-saved entry never turns it back into a draft.
      const finalStatus = next === "saved" || entry?.status === "saved" ? "saved" : "draft";
      const p = saveJournalEntryAction({ id, body, status: finalStatus });
      saving.current = p;
      const r = await p;
      if (r.ok) {
        if (r.data) setId(r.data);
        onState(r.state);
        setStatus("saved");
        setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        dirty.current = false;
        return r;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
    return null;
  }

  // Autosave drafts ~1.5s after typing stops (only once there's something to keep).
  useEffect(() => {
    if (!dirty.current || done || body.trim().length < 1) return;
    const timer = window.setTimeout(() => void persist("draft"), 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  async function finish() {
    if (body.trim().length < 3) return;
    const r = await persist("saved");
    if (r?.ok) setDone(true);
  }

  async function close() {
    if (dirty.current && body.trim()) await persist("draft");
    onClose();
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const statusText = status === "saving" ? j.saving : status === "error" ? j.saveError : status === "saved" ? (done ? j.saved : t(j.draftSaved, { time: savedAt ?? "" })) : "";

  return (
    <div className="overlay journal-editor" role="dialog" aria-modal="true" aria-label={j.editorLabel}>
      <header className="quest-flow-top">
        <button className="icon-btn" onClick={close} aria-label={j.close}><X size={22} /></button>
        <span className="journal-status" aria-live="polite">{statusText}</span>
        <span className="tag"><Lock size={12} /> {j.privateBadge}</span>
      </header>

      {!done ? (
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
          {body.length > 0 && body.trim().length < 3 && <p className="field-hint">{j.tooShort}</p>}
          <button className="btn btn--primary btn--lg btn--block" disabled={body.trim().length < 3 || status === "saving"} onClick={finish}><Check size={18} /> {j.finish}</button>
        </div>
      ) : (
        <div className="journal-editor-body journal-after">
          <h2>{j.afterSaveTitle}</h2>
          <p className="muted">{j.afterSaveBody}</p>
          {state.aiConfigured && !state.usage.reached && id && (
            <>
              {insightToggle}
              <button className="btn btn--primary btn--block" onClick={() => onReflect(id)}><Sparkles size={16} /> {j.askReflection}</button>
              <small className="muted">{plural(j.reflectRemaining, state.usage.remaining)} · {j.reflectDisclosure}</small>
            </>
          )}
          {state.usage.reached && <p className="muted">{t(j.limitReached, { date: date(state.usage.resets) })}</p>}
          <button className="btn btn--ghost btn--block" onClick={onClose}><Lock size={16} /> {j.keepPrivate}</button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import { companionPrompts, companions, feelingWords, questThemes, type CompanionId } from "@/lib/content";
import { berripopSays, moodFor } from "@/lib/berripop-messages";
import { useI18n } from "@/lib/i18n/client";
import { addMomentAction, deleteMomentAction } from "@/lib/server/actions";
import { decorForBadge, deriveWorld, regionForWeek, type DecorId } from "@/lib/world";
import BerripopReaction from "../berripop/BerripopReaction";
import Companion from "../world/Companion";
import ThemeGlyph from "../world/ThemeGlyph";
import WorldScene from "../world/WorldScene";
import type { ScreenProps } from "./types";

const CHIP_TONES = ["purple", "coral", "mint", "sky", "sun"] as const;

/** Finds which companion offers a prompt (prompt ids are "<companion>-<n>"). */
const companionOf = (promptId: string) => promptId.split("-")[0] as CompanionId;

export default function InnerWorldScreen({ view, run, notify, go }: ScreenProps) {
  const moments = view.snapshot.progress.moments;
  const today = view.today;
  const { d, t, plural, relativeDay } = useI18n();
  const w = d.innerWorld;
  const world = useMemo(() => deriveWorld(view, moments), [view, moments]);
  const [saving, setSaving] = useState(false);

  const [words, setWords] = useState<string[]>([]);
  const [ownWords, setOwnWords] = useState<string[]>([]);
  const [ownDraft, setOwnDraft] = useState("");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const placesOpen = Object.values(world.regions).filter(Boolean).length;
  const decorCount = Object.values(world.decorations).filter(Boolean).length;
  const sceneLabel = world.plants.length === 0
    ? w.sceneEmpty
    : t(w.sceneLabel, {
        plants: plural(w.scenePlants, world.plants.length),
        places: plural(w.scenePlaces, placesOpen),
        decorations: plural(w.sceneDecorations, decorCount),
      });

  const toggleWord = (id: string) => setWords(ws => (ws.includes(id) ? ws.filter(x => x !== id) : [...ws, id]));
  function addOwn() {
    const word = ownDraft.trim().slice(0, 30);
    if (word && !ownWords.includes(word)) setOwnWords(ws => [...ws, word]);
    setOwnDraft("");
  }
  const canSave = words.length > 0 || ownWords.length > 0 || note.trim().length > 0;
  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    const r = await run(addMomentAction({ words, ownWords, promptId, note: note.trim() }));
    setSaving(false);
    if (!r) return;
    setWords([]); setOwnWords([]); setPromptId(null); setNote("");
    setJustSaved(true);
    notify(w.moment.saved);
  }

  const badgeByDecor = Object.fromEntries(Object.entries(decorForBadge).map(([b, dec]) => [dec, b])) as Record<DecorId, keyof typeof d.gamification.badges>;
  const unlockedBadges = view.achievementIds;
  const prompts = companions.filter(c => world.companions[c]).flatMap(c => companionPrompts[c]);
  const maxTheme = Math.max(1, ...Object.values(view.themeCounts));
  const greetKey = justSaved ? "world.saved" : "world.welcome";

  return (
    <div className="stack inner-world">
      <button className="btn btn--text world-back" onClick={() => go("home")}><ArrowLeft size={16} /> {w.back}</button>
      <header className="page-head">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> {w.eyebrow}</span>
          <h1>{w.title}</h1>
          <p>{w.intro}</p>
        </div>
      </header>

      <section className="card world-card">
        <WorldScene world={world} label={sceneLabel} mood={justSaved ? "comforting" : moodFor[greetKey]} />
        <BerripopReaction mood={moodFor[greetKey]} message={berripopSays(d, greetKey, `${today}:${moments.length}`)} size={44} motion="none" className="world-reaction" />
        <p className="muted world-grows">{w.grows}</p>
        <details className="world-legend">
          <summary>{w.legendTitle}</summary>
          <ul>
            {regionForWeek.map(r => (
              <li key={r} className={world.regions[r] ? "is-open" : ""}>
                {world.regions[r] ? <Check size={14} /> : <Lock size={13} />}
                <span><strong>{world.regions[r] ? w.regions[r].name : w.hidden}</strong><small>{w.regions[r].hint}</small></span>
              </li>
            ))}
            {(Object.keys(world.decorations) as DecorId[]).map(dec => {
              const open = world.decorations[dec];
              const badge = badgeByDecor[dec];
              return (
                <li key={dec} className={open ? "is-open" : ""}>
                  {open ? <Check size={14} /> : <Lock size={13} />}
                  <span>
                    <strong>{open || unlockedBadges.has(badge) ? w.decor[dec] : w.hidden}</strong>
                    <small>{t(w.decorHint, { badge: d.gamification.badges[badge].name })}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      <section className="card moment-card" aria-labelledby="moment-title">
        <h2 id="moment-title">{w.moment.title}</h2>
        <p className="muted">{w.moment.subtitle}</p>

        <span className="field-label" id="words-label">{w.moment.wordsLabel}</span>
        <div className="word-cloud" role="group" aria-labelledby="words-label">
          {feelingWords.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`chip word-chip tone-${CHIP_TONES[i % CHIP_TONES.length]} ${words.includes(id) ? "is-active" : ""}`}
              aria-pressed={words.includes(id)}
              onClick={() => toggleWord(id)}
            >
              {w.words[id]}
            </button>
          ))}
          {ownWords.map(word => (
            <button key={word} type="button" className="chip word-chip is-active is-own" aria-pressed onClick={() => setOwnWords(ws => ws.filter(x => x !== word))}>
              {word} ×
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="own-word">{w.moment.ownLabel}</label>
        <div className="own-word-row">
          <input
            id="own-word"
            className="input"
            value={ownDraft}
            maxLength={30}
            placeholder={w.moment.ownPlaceholder}
            onChange={e => setOwnDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }}
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={addOwn} disabled={!ownDraft.trim()}><Plus size={16} /> {w.moment.addWord}</button>
        </div>

        <span className="field-label">{w.moment.promptsLabel}</span>
        <div className="prompt-list">
          {prompts.map(pid => {
            const c = companionOf(pid);
            const active = promptId === pid;
            return (
              <button key={pid} type="button" className={`prompt-card ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => setPromptId(active ? null : pid)}>
                <Companion id={c} size={34} />
                <span>{w.prompts[pid as keyof typeof w.prompts]}</span>
              </button>
            );
          })}
        </div>

        <label className="field-label" htmlFor="moment-note">{promptId ? w.prompts[promptId as keyof typeof w.prompts] : w.moment.noteLabel}</label>
        <textarea id="moment-note" className="answer-box answer-box--small" value={note} onChange={e => setNote(e.target.value)} placeholder={w.moment.notePlaceholder} rows={3} maxLength={1000} />
        <p className="answer-hint"><Lock size={13} /> {w.moment.privacy}</p>
        {!canSave && (words.length > 0 || note.length > 0) && <p className="field-hint">{w.moment.empty}</p>}
        <button className="btn btn--primary btn--block" onClick={save} disabled={!canSave || saving}>{w.moment.save} <Sparkles size={16} /></button>
      </section>

      <section className="stack-sm">
        <div className="section-head"><h2>{w.moments.title}</h2></div>
        {moments.length === 0 ? (
          <p className="muted">{w.moments.empty}</p>
        ) : (
          <ul className="moment-list">
            {moments.map(m => (
              <li key={m.id} className="card moment-item">
                <div className="moment-top">
                  <span className="question-item-topic">{relativeDay(m.date, today)}</span>
                  {confirmId === m.id ? (
                    <span className="row-gap">
                      <span className="muted">{w.moments.confirmDelete}</span>
                      <button className="btn btn--text btn--inline" onClick={async () => { setConfirmId(null); if (await run(deleteMomentAction(m.id))) notify(w.moments.deleted); }}>{w.moments.confirmYes}</button>
                      <button className="btn btn--text btn--inline" onClick={() => setConfirmId(null)}>{d.common.cancel}</button>
                    </span>
                  ) : (
                    <button className="icon-btn" aria-label={w.moments.delete} onClick={() => setConfirmId(m.id)}><Trash2 size={16} /></button>
                  )}
                </div>
                {(m.words.length > 0 || m.ownWords.length > 0) && (
                  <div className="chip-row">
                    {m.words.map(id => <span key={id} className="tag">{w.words[id as keyof typeof w.words] ?? id}</span>)}
                    {m.ownWords.map(word => <span key={word} className="tag tag--coral">{word}</span>)}
                  </div>
                )}
                {m.promptId && <small className="muted">{t(w.moments.promptFrom, { name: d.companions[companionOf(m.promptId)].name })}</small>}
                {m.note && <p className="moment-note">{m.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-sm">
        <div className="section-head"><div><h2>{w.themesTitle}</h2><p className="muted">{w.themesNote}</p></div></div>
        <ul className="theme-bubbles">
          {questThemes.map((th, i) => {
            const n = view.themeCounts[th];
            const size = 64 + Math.round((n / maxTheme) * 34);
            return (
              <li key={th} className={`theme-bubble tone-${CHIP_TONES[i % CHIP_TONES.length]} ${n ? "" : "is-empty"}`} style={{ width: size, height: size }}>
                <ThemeGlyph theme={th} size={20} />
                <strong>{d.themes[th].name}</strong>
                <small>{plural(w.themeCount, n)}</small>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stack-sm">
        <div className="section-head"><div><h2>{w.companionsTitle}</h2><p className="muted">{w.companionsIntro}</p></div></div>
        <ul className="companion-list">
          {companions.map(c => {
            const open = world.companions[c];
            const info = d.companions[c];
            return (
              <li key={c} className={`card companion-card ${open ? "" : "is-locked"}`}>
                <Companion id={c} size={64} locked={!open} label={open ? info.name : d.companions.hidden} />
                <div>
                  <strong>{open ? info.name : d.companions.hidden}</strong>
                  {open && <small className="companion-kind">{info.kind}</small>}
                  <p>{open ? info.about : info.unlock}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card reflections-card">
        <h2>{w.reflectionsTitle}</h2>
        <p className="muted">{view.facts.answered ? plural(w.reflectionsBody, view.facts.answered) : w.reflectionsNone}</p>
        {view.facts.answered > 0 && <button className="btn btn--text" onClick={() => go("explore")}>{w.reflectionsCta} <ArrowRight size={16} /></button>}
      </section>

      <p className="prototype-note">{w.disclaimer}</p>
    </div>
  );
}

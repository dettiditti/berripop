"use client";

import { useState } from "react";
import { Check, ChevronDown, Lock, Medal } from "lucide-react";
import { MILESTONE_COPY, MILESTONE_GROUPS, milestonesFrom, nextMilestone, type MilestoneCounts, type MilestoneGroup } from "@/lib/milestones";
import { useI18n } from "@/lib/i18n/client";
import { MILESTONE_ICONS as ICONS } from "./milestoneIcons";

const COLLAPSED = 9;

/** The member's own milestones: progress, the closest next one and a filterable grid. The counts are loaded by the app shell. */
export default function MilestonesSection({ counts, bestStreak }: { counts: MilestoneCounts | null | undefined; bestStreak: number }) {
  const { locale, t } = useI18n();
  const c = MILESTONE_COPY[locale];
  const [group, setGroup] = useState<MilestoneGroup | "all">("all");
  const [open, setOpen] = useState(false);

  // undefined: still loading; null: could not be loaded, so the section stays hidden.
  if (counts === null) return null;
  if (!counts) return <section className="card milestones" aria-busy="true"><span className="eyebrow">{c.eyebrow}</span><h2>{c.title}</h2></section>;

  const all = milestonesFrom(counts, bestStreak);
  const done = all.filter(m => m.done).length;
  const next = nextMilestone(all);
  const groups = MILESTONE_GROUPS.filter(g => all.some(m => m.group === g));
  const list = group === "all" ? all : all.filter(m => m.group === group);
  const shown = group === "all" && !open ? list.slice(0, COLLAPSED) : list;
  const NextIcon = next ? ICONS[next.id] : Medal;

  return (
    <section className="card milestones" aria-labelledby="milestones-title">
      <div className="section-head">
        <div><span className="eyebrow">{c.eyebrow}</span><h2 id="milestones-title">{c.title}</h2></div>
        <span className="tag">{done} / {all.length}</span>
      </div>
      <span className="milestones-bar" role="img" aria-label={t(c.progress, { done, total: all.length })}><i style={{ width: `${(done / all.length) * 100}%` }} /></span>

      {next ? (
        <div className="milestones-next">
          <span className="milestones-next-icon" aria-hidden><NextIcon size={22} /></span>
          <span className="milestones-next-main">
            <small>{c.next}</small>
            <strong>{c.items[next.id].label}</strong>
            <span className="milestones-bar milestones-bar--thin" aria-hidden><i style={{ width: `${(next.have / next.need) * 100}%` }} /></span>
          </span>
          <span className="milestones-next-count tabular">{next.have}/{next.need}</span>
        </div>
      ) : <p className="muted">{c.allDone}</p>}

      <div className="milestones-filter" role="group" aria-label={c.filter}>
        <button type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")}>{c.all}</button>
        {groups.map(g => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{c.groups[g]}</button>)}
      </div>

      <ul className="milestones-grid">
        {shown.map(m => {
          const Icon = ICONS[m.id];
          const copy = c.items[m.id];
          return (
            <li key={m.id} className={`mst-tile ${m.done ? "is-done" : ""}`} title={copy.hint}>
              <span className="mst-icon" aria-hidden>
                {m.done ? <Icon size={22} /> : <Lock size={17} />}
                {m.done && <span className="mst-check"><Check size={10} strokeWidth={4} /></span>}
              </span>
              <strong>{copy.label}</strong>
              {m.done ? <small>{c.done}</small> : (
                <span className="mst-progress">
                  <span className="milestones-bar milestones-bar--thin" aria-hidden><i style={{ width: `${(m.have / m.need) * 100}%` }} /></span>
                  <small className="tabular">{m.have}/{m.need}</small>
                </span>
              )}
              <span className="sr-only">{copy.hint}</span>
            </li>
          );
        })}
      </ul>

      {group === "all" && list.length > COLLAPSED && (
        <button type="button" className="btn btn--ghost btn--sm btn--block" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? c.less : t(c.more, { n: list.length })}
          <ChevronDown size={16} aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.2s ease" }} />
        </button>
      )}
    </section>
  );
}

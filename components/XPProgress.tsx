"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { levelName } from "@/lib/i18n/content";
import { getLevelInfo } from "@/lib/progress";
import LevelBadge from "./LevelBadge";

type Props = {
  xp: number;
  /** When set, the bar animates from this XP value to `xp`. */
  from?: number;
  label?: string;
  compact?: boolean;
};

export default function XPProgress({ xp, from, label, compact = false }: Props) {
  const { d, t, num } = useI18n();
  const info = getLevelInfo(xp);
  const name = levelName(d, info.level);
  const start = from !== undefined && getLevelInfo(from).level === info.level ? getLevelInfo(from).progress : from !== undefined ? 0 : info.progress;
  const [pct, setPct] = useState(start);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(info.progress));
    return () => cancelAnimationFrame(id);
  }, [info.progress]);

  return (
    <div className={`xp-progress ${compact ? "xp-progress--compact" : ""}`}>
      <LevelBadge level={info.level} name={name} size={compact ? "sm" : "md"} />
      <div className="xp-progress-body">
        <div className="xp-progress-top">
          <strong>{label ?? name}</strong>
          <span className="tabular">{info.next ? t(d.gamification.xpToNext, { n: num(info.toNext), level: info.level + 1 }) : t(d.common.xp, { n: num(xp) })}</span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.progress * 100)} aria-label={t(d.gamification.levelProgress, { n: info.level })}>
          <span style={{ width: `${Math.max(4, pct * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

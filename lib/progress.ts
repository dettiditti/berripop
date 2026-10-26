import { levels, overflowStep } from "./content";
import { addDays } from "./dates";

/**
 * Level and streak maths shared by every screen. Rewards themselves are decided
 * on the server (lib/server/actions.ts) using lib/domain/rules.ts.
 */

export type BadgeId =
  | "first-tiny-step" | "curious-mind" | "good-listener" | "growing-together"
  | "seven-little-wins" | "journey-explorer" | "full-bunch";

/* ---------- Levels ---------- */

/** Level names are localized in the UI (`levelName`). */
export type LevelInfo = {
  level: number;
  min: number;
  next: number | null;
  /** 0..1 progress towards the next level. */
  progress: number;
  toNext: number;
};

export function getLevelInfo(xp: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < levels.length; i++) if (xp >= levels[i].min) idx = i;
  const last = levels[levels.length - 1];
  if (idx === levels.length - 1) {
    const extra = Math.floor((xp - last.min) / overflowStep);
    const min = last.min + extra * overflowStep;
    const next = min + overflowStep;
    return { level: last.level + extra, min, next, progress: (xp - min) / overflowStep, toNext: next - xp };
  }
  const cur = levels[idx];
  const next = levels[idx + 1].min;
  return { level: cur.level, min: cur.min, next, progress: (xp - cur.min) / (next - cur.min), toNext: next - xp };
}

/* ---------- Streaks (gentle: nothing earned is ever taken away) ---------- */

/**
 * Rest days: a single missed day between two active days never breaks a
 * streak (it just doesn't count). Two missed days in a row end it, and the
 * app welcomes you back instead.
 */
export type StreakInfo = {
  current: number;
  best: number;
  activeToday: boolean;
  welcomeBack: boolean;
  /** Yesterday was skipped but the streak is still alive. */
  restedYesterday: boolean;
};

export function streakOf(active: Set<string>, today: string): StreakInfo {
  const activeToday = active.has(today);
  const earliest = [...active].sort()[0];
  let current = 0;
  let misses = 0;
  // Today isn't a miss yet: it simply hasn't happened.
  for (let d = activeToday ? today : addDays(today, -1); earliest && d >= earliest; d = addDays(d, -1)) {
    if (active.has(d)) {
      current++;
      misses = 0;
    } else if (++misses >= 2) break;
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...active].sort()) {
    run = prev && (addDays(prev, 1) === d || addDays(prev, 2) === d) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const yesterday = addDays(today, -1);
  return {
    current,
    best,
    activeToday,
    welcomeBack: active.size > 0 && current === 0,
    restedYesterday: current > 0 && !active.has(yesterday) && !activeToday,
  };
}


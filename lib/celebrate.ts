/*
 * Which badges and milestones still need their one-time celebration.
 * The "already celebrated" ids live in this browser only (localStorage),
 * one list per member and kind. The first time a list is seen on a device
 * it becomes the baseline silently, so nothing old pops up at once.
 */

export type CelebrationKind = "badge" | "milestone";

export const celebratedKey = (userId: string, kind: CelebrationKind) => `berripop-celebrated:${kind}:${userId}`;

/** fresh: reached now but not celebrated yet. next: what to store. prev null means no baseline yet. */
export function freshlyReached(prev: readonly string[] | null, current: readonly string[]): { fresh: string[]; next: string[] } {
  if (prev === null) return { fresh: [], next: [...new Set(current)] };
  const seen = new Set(prev);
  const fresh = [...new Set(current)].filter(id => !seen.has(id));
  return { fresh, next: fresh.length ? [...prev, ...fresh] : [...prev] };
}

export function readCelebrated(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function writeCelebrated(key: string, ids: readonly string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage blocked: celebrations just may repeat */ }
}

/** How long the full-screen celebration stays before closing by itself. */
export const CELEBRATION_MS = 1800;

export const CELEBRATE_COPY = {
  hu: { badge: "Új jelvény!", milestone: "Mérföldkő elérve!", close: "Bezárás" },
  en: { badge: "New badge!", milestone: "Milestone reached!", close: "Close" },
} as const;

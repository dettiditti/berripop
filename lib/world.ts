import type { CompanionId } from "./content";
import { isWorldItem, type WorldItemId } from "./wardrobe";
import type { View } from "./domain/view";
import type { BadgeId } from "./progress";

/**
 * The little world in "My Inner World". It only ever grows from real
 * participation: nothing here costs money, is rolled for, or is taken away
 * (treasure-chest things are picked with stars earned by taking part).
 */

export type RegionId = "meadow" | "pond" | "isles";

/** Where Berri's little world is: the member picks one; growth works the same in each. */
export const SCENES = ["meadow", "city", "exotic"] as const;
export type SceneId = (typeof SCENES)[number];
export const isScene = (v: unknown): v is SceneId => typeof v === "string" && (SCENES as readonly string[]).includes(v);
export type DecorId = "lantern" | "bubbles" | "kite" | "chimes" | "bridge" | "signpost" | "arch";

/** Each badge adds one decoration. */
export const decorForBadge: Record<BadgeId, DecorId> = {
  "first-tiny-step": "lantern",
  "curious-mind": "bubbles",
  "seven-little-wins": "kite",
  "good-listener": "chimes",
  "growing-together": "bridge",
  "journey-explorer": "signpost",
  "full-bunch": "arch",
};

/** Journey weeks reveal regions, in order. */
export const regionForWeek: RegionId[] = ["meadow", "pond", "isles"];

export const MAX_SPROUTS = 12;
export const MAX_GLOWS = 8;

export type World = {
  /** Plant growth stages (0 sprout, 1 bud, 2 flower) for each visible plant. */
  plants: number[];
  regions: Record<RegionId, boolean>;
  decorations: Record<DecorId, boolean>;
  companions: Record<CompanionId, boolean>;
  /** Glowing discoveries: one per saved moment, up to MAX_GLOWS. */
  glows: number;
  /** Something grew today (shows a gentle sparkle). */
  grewToday: boolean;
  themesExplored: number;
  /** The chosen backdrop (meadow by default). */
  scene: SceneId;
  /** Things from the treasure chest that are out in the world (lib/wardrobe). */
  items: Partial<Record<WorldItemId, boolean>>;
};

export function deriveWorld(view: View, moments: { date: string }[]): World {
  const answered = view.facts.answered;
  const plants = Array.from({ length: Math.min(answered, MAX_SPROUTS) }, (_, i) => Math.min(2, Math.floor((answered - 1 - i) / 3)));

  const decorations = Object.fromEntries(Object.values(decorForBadge).map(d => [d, false])) as Record<DecorId, boolean>;
  for (const id of view.achievementIds) if (id in decorForBadge) decorations[decorForBadge[id as BadgeId]] = true;

  const themesExplored = Object.values(view.themeCounts).filter(n => n > 0).length;
  const weeks = view.facts.weeksDone;
  const today = view.today;

  return {
    plants,
    regions: { meadow: weeks >= 1, pond: weeks >= 2, isles: weeks >= 3 },
    decorations,
    companions: { nubi: true, zing: themesExplored >= 3, kobi: weeks >= 1 },
    glows: Math.min(moments.length, MAX_GLOWS),
    grewToday: view.myAnswers.some(a => a.date === today) || Object.values(view.myJourney).includes(today) || moments.some(m => m.date === today),
    themesExplored,
    scene: isScene(view.snapshot.me.scene) ? view.snapshot.me.scene : "meadow",
    items: Object.fromEntries((view.snapshot.wardrobe?.equipped ?? []).filter(isWorldItem).map(id => [id, true])),
  };
}

"use client";

import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { SCENES, type SceneId, type World } from "@/lib/world";
import WorldScene from "./WorldScene";

/** A grown little world, so each card shows what the backdrop becomes. */
const preview = (scene: SceneId): World => ({
  plants: [2, 1, 2, 0, 2, 1],
  regions: { meadow: true, pond: true, isles: true },
  decorations: { lantern: false, bubbles: false, kite: false, chimes: false, bridge: false, signpost: false, arch: false },
  companions: { nubi: false, zing: false, kobi: false },
  glows: 0,
  grewToday: false,
  themesExplored: 0,
  scene,
  items: {},
});

/** Three tappable backdrop cards (meadow, city, exotic) for the start flow and Settings. */
export default function ScenePicker({ value, onPick, labelledBy }: { value?: SceneId; onPick: (scene: SceneId) => void; labelledBy?: string }) {
  const { d } = useI18n();
  const w = d.worldScene;
  return (
    <div className="scene-picker" role="radiogroup" aria-labelledby={labelledBy}>
      {SCENES.map(s => {
        const on = value === s;
        return (
          <button key={s} type="button" role="radio" aria-checked={on} className={`scene-option ${on ? "is-selected" : ""}`} onClick={() => onPick(s)}>
            <WorldScene world={preview(s)} label={w.names[s]} compact />
            <span className="scene-option-name">
              {on && <Check size={16} strokeWidth={3} aria-hidden />} {w.names[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

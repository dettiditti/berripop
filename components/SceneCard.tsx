"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { isScene, type SceneId } from "@/lib/world";
import { setSceneAction } from "@/lib/server/actions";
import ScenePicker from "./world/ScenePicker";

/** Settings: where Berri lives (the world's backdrop). Can be changed any time. */
export default function SceneCard({ initial, notify }: { initial: string; notify: (message: string) => void }) {
  const { d } = useI18n();
  const w = d.worldScene;
  const [scene, setScene] = useState<SceneId>(isScene(initial) ? initial : "meadow");

  async function pick(next: SceneId) {
    if (next === scene) return;
    const before = scene;
    setScene(next);
    try {
      const r = await setSceneAction(next);
      if (r.ok) { notify(w.saved); return; }
    } catch {
      // Falls through to the generic error.
    }
    setScene(before);
    notify(d.auth.error);
  }

  return (
    <section className="card stack-sm" aria-labelledby="set-scene">
      <h2 id="set-scene">{w.settingsTitle}</h2>
      <p className="muted">{w.settingsBody}</p>
      <ScenePicker value={scene} onPick={pick} labelledBy="set-scene" />
    </section>
  );
}

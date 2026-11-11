"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess, hapticTap } from "@/lib/nativeBridge";
import { dismissScenePromptAction, setSceneAction } from "@/lib/server/actions";
import { isScene, type SceneId } from "@/lib/world";
import { Sheet } from "./Modals";
import type { Run } from "./screens/types";
import ScenePicker from "./world/ScenePicker";

/**
 * Once per account, for members who joined before backdrops existed (or never
 * chose one): "New: Berri can move!" with the three backdrops. Choosing one or
 * "Not now" both close it for good (user_prefs.scene_picked); Settings keeps
 * the same choice available any time.
 */
export default function ScenePrompt({ current, run, notify }: { current: string; run: Run; notify: (message: string) => void }) {
  const { d } = useI18n();
  const w = d.worldScene;
  const [scene, setScene] = useState<SceneId>(isScene(current) ? current : "meadow");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await run(setSceneAction(scene));
    if (r) { hapticSuccess(); notify(w.saved); }
    else setBusy(false);
  }
  async function later() {
    setBusy(true);
    if (!(await run(dismissScenePromptAction()))) setBusy(false);
  }

  return (
    <Sheet title={w.promptTitle} kicker={w.promptKicker} onClose={() => { if (!busy) void later(); }}>
      <div className="stack-sm scene-prompt">
        <p className="muted">{w.promptBody}</p>
        <ScenePicker value={scene} onPick={s => { hapticTap(); setScene(s); }} labelledBy="sheet-title" />
        <div className="sheet-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={later}>{w.promptLater}</button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{w.promptSave}</button>
        </div>
      </div>
    </Sheet>
  );
}

"use client";

import { useCallback } from "react";
import type { ActionError, ActionResult, Snapshot } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n/client";
import type { Run } from "./screens/types";

/** Runs a server action, applies the returned snapshot, and turns errors into a friendly message. */
export function useRun(setSnapshot: (s: Snapshot) => void, notify: (m: string) => void): Run {
  const { d } = useI18n();
  return useCallback(
    async <T,>(p: Promise<ActionResult<T>>) => {
      try {
        const r = await p;
        if (r.ok) {
          setSnapshot(r.snapshot);
          return r;
        }
        const e: ActionError = r.error;
        const messages: Partial<Record<ActionError, string>> = {
          locked: d.auth.locked,
          owner_cannot_leave: d.circle.ownerCantLeave,
          limit_goals: d.billing.prompts.goals.title,
          limit_circles: d.billing.prompts.circles.title,
          limit_ai: d.billing.prompts.ai.title,
          premium_required: d.billing.prompts.summary.title,
          billing_unavailable: d.billing.unavailable,
          ai_unavailable: d.aiAssist.unavailable,
        };
        notify(messages[e] ?? d.auth.error);
      } catch {
        notify(d.auth.error);
      }
      return null;
    },
    [setSnapshot, notify, d],
  ) as Run;
}

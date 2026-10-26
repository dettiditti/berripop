import type { ReactNode } from "react";
import type { QuestTheme } from "@/lib/types";

/** Small abstract marks for quest themes. Shape carries identity; colour comes from context. */
const paths: Record<QuestTheme, ReactNode> = {
  // A widening spiral: noticing more.
  discover: <path d="M12 12 m0 0 a1.5 1.5 0 1 1 2 1.6 a4 4 0 1 1 -5.6 -4.4 a6.5 6.5 0 1 1 1.8 11.5" />,
  // Ripples from a drop: something moving inside.
  feel: <><circle cx="12" cy="13" r="2" /><path d="M6.5 13 a5.5 5.5 0 0 1 11 0" /><path d="M3 13 a9 9 0 0 1 18 0" /></>,
  // Two dots joined by a soft loop.
  connect: <><circle cx="6.5" cy="13" r="3" /><circle cx="17.5" cy="13" r="3" /><path d="M9 11 q3 -5 6 0" /></>,
  // A cup with a little steam curl.
  recharge: <><path d="M5 11 h12 v3 a5 5 0 0 1 -5 5 h-2 a5 5 0 0 1 -5 -5 z" /><path d="M17 12 h1.5 a2 2 0 0 1 0 4 H17" /><path d="M10 8 q-1.5 -2 0 -4" /></>,
  // A sprout with two leaves.
  grow: <><path d="M12 21 V11" /><path d="M12 13 q-6 0 -6 -6 q6 0 6 6" /><path d="M12 11 q5 0 5 -5 q-5 0 -5 5" /></>,
};

export default function ThemeGlyph({ theme, size = 18 }: { theme: QuestTheme; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="theme-glyph">
      {paths[theme]}
    </svg>
  );
}

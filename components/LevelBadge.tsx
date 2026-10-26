"use client";

import { useI18n } from "@/lib/i18n/client";

const tones = ["purple", "sky", "mint", "coral", "sun"] as const;

// A soft 10-point burst around the centre of a 48×48 box.
const burst = Array.from({ length: 20 }, (_, i) => {
  const r = i % 2 === 0 ? 23 : 19.5;
  const a = (Math.PI * i) / 10 - Math.PI / 2;
  return `${(24 + r * Math.cos(a)).toFixed(2)},${(24 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

type Props = { level: number; name?: string; size?: "sm" | "md" | "lg"; glow?: boolean };

/** A rounded-burst level emblem. Colour cycles with the level number. */
export default function LevelBadge({ level, name, size = "md", glow = false }: Props) {
  const { d, t } = useI18n();
  const label = name ? t(d.gamification.levelNamed, { n: level, name }) : t(d.gamification.levelName, { n: level });
  const tone = tones[(level - 1) % tones.length];
  return (
    <span className={`level-badge level-badge--${size} tone-${tone} ${glow ? "is-glowing" : ""}`} title={label}>
      <svg viewBox="0 0 48 48" aria-hidden>
        <polygon points={burst} strokeLinejoin="round" />
      </svg>
      <strong aria-hidden>{level}</strong>
      <span className="sr-only">{label}</span>
    </span>
  );
}

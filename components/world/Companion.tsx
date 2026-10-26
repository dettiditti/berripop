import { useId, type CSSProperties } from "react";
import type { CompanionId } from "@/lib/content";

const INK = "#2B1B4A";

/** Same glossy eye style as Berripop so the whole cast feels like one family. */
function Eyes({ cx1, cx2, cy, r = 7, look = 0, id }: { cx1: number; cx2: number; cy: number; r?: number; look?: number; id: string }) {
  return (
    <g className="cmp-eyes">
      {[cx1, cx2].map(cx => (
        <g key={cx}>
          <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill="#fff" />
          <ellipse cx={cx + look} cy={cy + 1} rx={r * 0.66} ry={r * 0.74} fill={`url(#${id}-pupil)`} />
          <circle cx={cx + look + r * 0.28} cy={cy - r * 0.3} r={r * 0.26} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Defs({ id, light, mid, dark }: { id: string; light: string; mid: string; dark: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-body`} cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor={light} />
        <stop offset="55%" stopColor={mid} />
        <stop offset="100%" stopColor={dark} />
      </radialGradient>
      <radialGradient id={`${id}-pupil`} cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#4A3570" />
        <stop offset="100%" stopColor={INK} />
      </radialGradient>
    </defs>
  );
}

/** Nubi: a lumpy little fog puff with a curling wisp. Drifts and peeks. */
function Nubi({ id }: { id: string }) {
  return (
    <>
      <Defs id={id} light="#FFFFFF" mid="#ECE6FF" dark="#C7BCEB" />
      <ellipse cx={50} cy={92} rx={22} ry={3.5} fill={INK} opacity={0.08} />
      <g className="cmp-body cmp-nubi">
        <path d="M50 18 q4 -9 11 -6" stroke="#C7BCEB" strokeWidth={3} strokeLinecap="round" fill="none" />
        <path
          d="M24 70 C12 70 10 54 22 50 C18 36 34 28 42 36 C46 24 64 24 66 38 C78 32 90 44 82 54 C94 58 90 76 76 74 C70 82 58 80 54 74 C46 82 30 80 24 70 Z"
          fill={`url(#${id}-body)`}
        />
        <path d="M44 78 q-4 8 3 12 q4 2 6 -2" stroke="#C7BCEB" strokeWidth={3} strokeLinecap="round" fill="none" />
        <ellipse cx={38} cy={42} rx={7} ry={3.5} fill="#fff" opacity={0.9} transform="rotate(-20 38 42)" />
        <Eyes cx1={42} cx2={60} cy={56} r={6} look={1} id={id} />
        <path d="M47 67 Q51 70 55 67" stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <ellipse cx={34} cy={63} rx={5} ry={3} fill="#FFB3C1" opacity={0.6} />
        <ellipse cx={68} cy={63} rx={5} ry={3} fill="#FFB3C1" opacity={0.6} />
      </g>
    </>
  );
}

/** Zing: a seed-fluff explorer, a warm core haloed by drifting threads. */
function Zing({ id }: { id: string }) {
  const threads = Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12);
  return (
    <>
      <Defs id={id} light="#FFF6D6" mid="#FFD98A" dark="#F2A65A" />
      <ellipse cx={50} cy={94} rx={14} ry={3} fill={INK} opacity={0.08} />
      <g className="cmp-body cmp-zing">
        <path d="M50 74 q-3 10 2 18" stroke="#E9A25B" strokeWidth={2.4} strokeLinecap="round" fill="none" />
        <g className="cmp-fluff" stroke="#F7C77E" strokeWidth={1.6} strokeLinecap="round">
          {threads.map(a => {
            // Rounded so server and client render identical attributes.
            const r = (n: number) => Math.round(n * 100) / 100;
            const x1 = r(50 + Math.cos(a) * 22), y1 = r(50 + Math.sin(a) * 22);
            const x2 = r(50 + Math.cos(a) * 36), y2 = r(50 + Math.sin(a) * 36);
            return (
              <g key={a}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <circle cx={x2} cy={y2} r={2.4} fill="#FFE7B0" stroke="none" />
              </g>
            );
          })}
        </g>
        <circle cx={50} cy={50} r={22} fill={`url(#${id}-body)`} />
        <ellipse cx={42} cy={40} rx={6} ry={3.5} fill="#fff" opacity={0.8} transform="rotate(-25 42 40)" />
        <Eyes cx1={43} cx2={58} cy={50} r={6.4} look={1.5} id={id} />
        <ellipse cx={51} cy={61} rx={3} ry={3.4} fill={INK} />
      </g>
    </>
  );
}

/** Kobi: a sturdy, smooth pebble with a moss tuft and determined brows. */
function Kobi({ id }: { id: string }) {
  return (
    <>
      <Defs id={id} light="#EAF2FB" mid="#A9BFD6" dark="#6E88A6" />
      <ellipse cx={50} cy={92} rx={28} ry={3.5} fill={INK} opacity={0.1} />
      <g className="cmp-body cmp-kobi">
        <ellipse cx={38} cy={87} rx={8} ry={4.5} fill="#5B7391" />
        <ellipse cx={62} cy={87} rx={8} ry={4.5} fill="#5B7391" />
        <path d="M18 64 C16 40 34 30 52 30 C72 30 86 42 84 64 C82 82 66 88 50 88 C32 88 20 82 18 64 Z" fill={`url(#${id}-body)`} />
        <path d="M40 32 q4 -10 9 -2 q3 -9 8 0 q5 -7 7 3" fill="#6EDCA6" stroke="#2FB37C" strokeWidth={1.4} strokeLinejoin="round" />
        <ellipse cx={34} cy={44} rx={9} ry={4} fill="#fff" opacity={0.6} transform="rotate(-18 34 44)" />
        <g stroke={INK} strokeWidth={3} strokeLinecap="round">
          <path d="M33 50 L44 52" />
          <path d="M58 52 L69 50" />
        </g>
        <Eyes cx1={40} cx2={62} cy={60} r={6} id={id} />
        <path d="M44 74 Q51 78 58 74" stroke={INK} strokeWidth={2.8} strokeLinecap="round" fill="none" />
      </g>
    </>
  );
}

type Props = { id: CompanionId; size?: number; locked?: boolean; className?: string; style?: CSSProperties; label?: string };

/** One of Berripop's original companions. Locked companions show as a soft mystery silhouette. */
export default function Companion({ id, size = 72, locked = false, className = "", style, label }: Props) {
  const uid = useId().replace(/:/g, "");
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`companion companion--${id} ${locked ? "is-locked" : ""} ${className}`} style={style} {...a11y}>
      {locked ? (
        <g>
          <circle cx={50} cy={54} r={32} fill="#EEE8F7" stroke="#D9CFEA" strokeWidth={2.5} strokeDasharray="4 6" />
          <text x={50} y={66} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight={700} fontSize={34} fill="#B9AECB">?</text>
        </g>
      ) : id === "nubi" ? <Nubi id={uid} /> : id === "zing" ? <Zing id={uid} /> : <Kobi id={uid} />}
    </svg>
  );
}

import { useId, type CSSProperties } from "react";

/**
 * Moods, each with its own face and body language:
 * happy (gentle bounce), excited (anticipation + small jump), curious (leans in,
 * looks around), thinking (looks up, pauses), proud (stands tall), sleepy (slow
 * blink, yawn), encouraging (wink + wave), comforting (soft eyes, hugging pose, slow sway).
 */
export type BerripopMood = "happy" | "excited" | "curious" | "thinking" | "proud" | "sleepy" | "encouraging" | "comforting";
export type BerripopMotion = "none" | "subtle" | "lively";

const INK = "#2B1B4A";

const skins = {
  // Berripop himself.
  grape: { light: "#B796FF", mid: "#7B4DFF", dark: "#4A22C4", foot: "#3E1BA6", cheek: "#FF8FA3" },
  // His green-grape buddy, used when showing "together".
  buddy: { light: "#C9F7B0", mid: "#7FDB6A", dark: "#3E9E3A", foot: "#2F7F2E", cheek: "#FF9C85" },
};
type Skin = keyof typeof skins;

function Eyes({ mood, id }: { mood: BerripopMood; id: string }) {
  // Closed, smiling eyes.
  if (mood === "proud") {
    return (
      <g stroke={INK} strokeWidth={4.2} strokeLinecap="round" fill="none">
        <path d="M38 66 Q46 57 54 66" />
        <path d="M66 66 Q74 57 82 66" />
      </g>
    );
  }
  const look =
    mood === "curious" ? { x: 2.5, y: -2.5 }
      : mood === "thinking" ? { x: -2.5, y: -3.5 }
        : mood === "sleepy" ? { x: 0, y: 2 }
          : mood === "comforting" ? { x: 0, y: 1.5 }
            : { x: 1, y: 0.5 };
  const lid = mood === "sleepy" ? 61 : mood === "comforting" ? 57.5 : null;
  const big = mood === "excited";
  const wink = mood === "encouraging";
  return (
    <g className="bp-eyes">
      {[46, 74].map(cx => {
        if (wink && cx === 74) {
          return <path key={cx} d="M67 66 Q74 60 81 66" stroke={INK} strokeWidth={4.2} strokeLinecap="round" fill="none" />;
        }
        return (
          <g key={cx}>
            <ellipse cx={cx} cy={64} rx={big ? 10 : 9} ry={big ? 11.5 : 10.5} fill="#fff" />
            <g className="bp-pupil">
              <ellipse cx={cx + look.x} cy={65 + look.y} rx={big ? 7 : 6.2} ry={big ? 7.8 : 7} fill={`url(#${id}-pupil)`} />
              <circle cx={cx + look.x + 2.4} cy={62 + look.y} r={big ? 2.8 : 2.4} fill="#fff" />
              <circle cx={cx + look.x - 2.2} cy={68 + look.y} r={1.2} fill="#fff" opacity={0.85} />
            </g>
            {lid !== null && (
              <g className="bp-lid">
                <path d={`M${cx - 10.5} ${lid} Q${cx} ${lid - 6} ${cx + 10.5} ${lid} L${cx + 10.5} 52 L${cx - 10.5} 52 Z`} fill={`url(#${id}-body)`} />
                <path d={`M${cx - 10} ${lid + 0.5} Q${cx} ${lid - 4} ${cx + 10} ${lid + 0.5}`} stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />
              </g>
            )}
          </g>
        );
      })}
      {mood === "curious" && <path d="M65 49 Q74 44 83 49" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />}
      {mood === "thinking" && <path d="M37 50 Q45 47 53 51" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />}
      {mood === "comforting" && (
        <g stroke={INK} strokeWidth={2.8} strokeLinecap="round" fill="none" opacity={0.8}>
          <path d="M38 50 Q45 47 52 48" />
          <path d="M68 48 Q75 47 82 50" />
        </g>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: BerripopMood }) {
  return <g className="bp-mouth"><MouthShape mood={mood} /></g>;
}

function MouthShape({ mood }: { mood: BerripopMood }) {
  switch (mood) {
    case "excited":
      return (
        <g>
          <path d="M49 79 Q60 97 71 79 Z" fill={INK} />
          <path d="M54 87 Q60 92 66 87 Q60 84 54 87 Z" fill="#FF7A8A" />
        </g>
      );
    case "curious":
      return <ellipse cx={61} cy={83} rx={3.6} ry={4.2} fill={INK} />;
    case "thinking":
      return <path d="M53 83 Q58 80 62 83 T70 82" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />;
    case "sleepy":
      return <ellipse cx={60} cy={83} rx={4} ry={2.6} fill={INK} />;
    case "comforting":
      return <path d="M53 81 Q60 87 67 81" stroke={INK} strokeWidth={3.4} strokeLinecap="round" fill="none" />;
    case "proud":
      return <path d="M47 78 Q60 92 73 78" stroke={INK} strokeWidth={3.8} strokeLinecap="round" fill="none" />;
    default:
      // The signature cheeky, slightly lopsided smile.
      return <path d="M51 80 Q59 88 69 78" stroke={INK} strokeWidth={3.6} strokeLinecap="round" fill="none" />;
  }
}

const ARM_POSES = {
  down: { l: [21, 84, 25], r: [99, 84, -25] },
  up: { l: [19, 52, -25], r: [101, 52, 25] },
  hips: { l: [22, 80, 62], r: [98, 80, -62] },
} as const;

function Arms({ mood, id }: { mood: BerripopMood; id: string }) {
  const fill = `url(#${id}-body)`;
  // Comforting arms wrap the belly, so they're drawn in front of the body instead.
  if (mood === "comforting") return null;
  const left = mood === "excited" ? ARM_POSES.up.l : mood === "proud" ? ARM_POSES.hips.l : ARM_POSES.down.l;
  const right = mood === "excited" || mood === "encouraging" ? ARM_POSES.up.r : mood === "proud" ? ARM_POSES.hips.r : ARM_POSES.down.r;
  return (
    <g className="bp-arms">
      <g className="bp-arm-l"><ellipse cx={left[0]} cy={left[1]} rx={6.5} ry={10.5} fill={fill} transform={`rotate(${left[2]} ${left[0]} ${left[1]})`} /></g>
      <g className="bp-arm-r"><ellipse cx={right[0]} cy={right[1]} rx={6.5} ry={10.5} fill={fill} transform={`rotate(${right[2]} ${right[0]} ${right[1]})`} /></g>
    </g>
  );
}

function Body({ mood, skin, id }: { mood: BerripopMood; skin: Skin; id: string }) {
  const s = skins[skin];
  return (
    <>
      <defs>
        {/* Shared coordinates so arms, lids and body all catch the same light. */}
        <radialGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" cx={47} cy={51} r={64}>
          <stop offset="0%" stopColor={s.light} />
          <stop offset="48%" stopColor={s.mid} />
          <stop offset="100%" stopColor={s.dark} />
        </radialGradient>
        <radialGradient id={`${id}-pupil`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#4A3570" />
          <stop offset="100%" stopColor={INK} />
        </radialGradient>
        <radialGradient id={`${id}-cheek`}>
          <stop offset="0%" stopColor={s.cheek} stopOpacity={0.9} />
          <stop offset="100%" stopColor={s.cheek} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7EF0B4" />
          <stop offset="100%" stopColor="#1FB37C" />
        </linearGradient>
      </defs>
      <ellipse cx={60} cy={117} rx={30} ry={4.5} fill="#2B1B4A" opacity={0.12} className="bp-shadow" />
      <g className="bp-bounce">
        <g className="bp-leaf">
          <path d="M60 30 Q59 22 62 17" stroke="#8A5A3C" strokeWidth={4} strokeLinecap="round" fill="none" />
          <path d="M62 20 C66 8 82 4 90 9 C86 21 72 27 62 20 Z" fill={`url(#${id}-leaf)`} />
          <path d="M64 19 Q75 13 86 10" stroke="#159A68" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.7} />
        </g>
        <Arms mood={mood} id={id} />
        <ellipse cx={46} cy={111} rx={9.5} ry={5.5} fill={s.foot} />
        <ellipse cx={74} cy={111} rx={9.5} ry={5.5} fill={s.foot} />
        <circle cx={60} cy={69} r={41} fill={`url(#${id}-body)`} />
        {/* Glossy highlights for the soft 3D look. */}
        <ellipse cx={41} cy={45} rx={12} ry={7} fill="#fff" opacity={0.42} transform="rotate(-32 41 45)" />
        <circle cx={31} cy={56} r={3} fill="#fff" opacity={0.35} />
        <path d="M30 94 Q60 116 90 94" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.12} />
        <ellipse cx={33} cy={78} rx={9} ry={6} fill={`url(#${id}-cheek)`} />
        <ellipse cx={87} cy={78} rx={9} ry={6} fill={`url(#${id}-cheek)`} />
        <Eyes mood={mood} id={id} />
        <Mouth mood={mood} />
        {mood === "comforting" && (
          <g className="bp-hug" fill={`url(#${id}-body)`} stroke={s.dark} strokeWidth={1.2}>
            <ellipse cx={44} cy={97} rx={12} ry={6} transform="rotate(-18 44 97)" />
            <ellipse cx={76} cy={97} rx={12} ry={6} transform="rotate(18 76 97)" />
          </g>
        )}
        {/* Thinking: a little hand on the chin, drawn in front of the body. */}
        {mood === "thinking" && <ellipse cx={74} cy={94} rx={7} ry={5.5} fill={`url(#${id}-body)`} stroke={s.dark} strokeWidth={1.2} />}
      </g>
    </>
  );
}

function Extras({ mood }: { mood: BerripopMood }) {
  if (mood === "comforting") {
    return <path d="M104 40 c-2.5-4-8.5-2-7 2.6 c.7 3.3 7 6.5 7 6.5 s6.3-3.2 7-6.5 c1.5-4.6-4.5-6.6-7-2.6 z" fill="#FF9FB0" className="bp-float-heart" />;
  }
  if (mood === "proud" || mood === "excited") {
    return (
      <g fill="#FFC93C" className="bp-sparkles">
        <path d="M104 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" />
        <path d="M14 28 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 z" />
      </g>
    );
  }
  if (mood === "sleepy") {
    return (
      <g fill={INK} opacity={0.55} fontFamily="Fredoka, sans-serif" fontWeight={700} className="bp-zzz">
        <text x={96} y={34} fontSize={14}>z</text>
        <text x={106} y={22} fontSize={10}>z</text>
      </g>
    );
  }
  if (mood === "thinking") {
    return (
      <g fill="#fff" stroke="#E2D6FF" strokeWidth={2} className="bp-thought">
        <circle cx={98} cy={30} r={4} />
        <circle cx={108} cy={18} r={6} />
      </g>
    );
  }
  return null;
}

type Props = {
  mood?: BerripopMood;
  size?: number;
  motion?: BerripopMotion;
  /** Show Berripop with his green-grape buddy: personal and shared growth. */
  pair?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** Berripop: the app's original grape mascot, drawn as an SVG. */
export default function BerripopMascot({ mood = "happy", size = 96, motion = "subtle", pair = false, label, className = "", style }: Props) {
  const id = useId().replace(/:/g, "");
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  const cls = `berripop bp--${mood} bp-motion--${motion} ${className}`;

  if (pair) {
    return (
      <svg viewBox="0 0 230 124" width={size * 1.85} height={size} className={cls} style={style} {...a11y}>
        <g><Body mood={mood} skin="grape" id={`${id}a`} /></g>
        <g transform="translate(118 20) scale(0.84)" className="bp-buddy">
          <Body mood={mood === "excited" || mood === "proud" ? mood : "happy"} skin="buddy" id={`${id}b`} />
        </g>
        <path d="M113 60 c-4-6-13-3-11 4 c1 5 11 10 11 10 s10-5 11-10 c2-7-7-10-11-4 z" fill="#FF7A8A" className="bp-heart" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={cls} style={style} {...a11y}>
      <Body mood={mood} skin="grape" id={id} />
      <Extras mood={mood} />
    </svg>
  );
}

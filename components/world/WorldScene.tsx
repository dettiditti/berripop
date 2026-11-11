"use client";

import { useId, type ReactNode } from "react";
import type { SceneId, World } from "@/lib/world";
import BerripopMascot, { type BerripopMood } from "../berripop/BerripopMascot";
import Companion from "./Companion";

const FLOWERS = ["#FFB59A", "#FFE08A", "#A9D3FF", "#CDB8FF", "#9EEBC8"];
const PLANT_SLOTS: [number, number][] = [
  [34, 222], [62, 228], [300, 222], [328, 228], [92, 220], [270, 226],
  [120, 229], [242, 219], [146, 224], [216, 229], [12, 230], [348, 230],
];
const GLOW_SPOTS: [number, number][] = [[70, 90], [120, 60], [205, 78], [250, 50], [40, 120], [160, 105], [228, 120], [96, 128]];

function Plant({ x, y, stage, i, fresh }: { x: number; y: number; stage: number; i: number; fresh: boolean }) {
  const color = FLOWERS[i % FLOWERS.length];
  const h = 8 + stage * 6;
  return (
    <g className={`w-plant ${fresh ? "is-fresh" : ""}`} style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${(i % 5) * -0.7}s` }}>
      <g transform={`translate(${x} ${y}) scale(1.6) translate(${-x} ${-y})`}>
      <path d={`M${x} ${y} q-1 ${-h / 2} 0 ${-h}`} stroke="#3FBF86" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d={`M${x} ${y - h * 0.45} q-6 -1 -7 -6 q6 0 7 6`} fill="#6EDCA6" />
      <path d={`M${x} ${y - h * 0.6} q6 -1 7 -6 q-6 0 -7 6`} fill="#8BE6B8" />
      {stage === 1 && <circle cx={x} cy={y - h - 2} r={3} fill={color} />}
      {stage === 2 && (
        <g>
          {[0, 72, 144, 216, 288].map(a => (
            <ellipse key={a} cx={x} cy={y - h - 5} rx={2.6} ry={4.2} fill={color} transform={`rotate(${a} ${x} ${y - h - 1})`} />
          ))}
          <circle cx={x} cy={y - h - 1} r={2.4} fill="#FFF3C4" />
        </g>
      )}
      </g>
    </g>
  );
}

/** Colours that change with the backdrop: sky top/bottom, meadow top/bottom, pond light/deep. */
const PALETTE: Record<SceneId, { sky: [string, string]; meadow: [string, string]; pond: [string, string] }> = {
  meadow: { sky: ["#EFE8FF", "#FFF4EA"], meadow: ["#BFF3D8", "#8EE3BA"], pond: ["#CFE6FF", "#8EC3FF"] },
  city: { sky: ["#E6E0FF", "#FFEDE2"], meadow: ["#C4F1D6", "#93E0B6"], pond: ["#D6EAFF", "#9DCBFF"] },
  exotic: { sky: ["#FFE1D2", "#FFF6E2"], meadow: ["#A8EDC0", "#5FD39A"], pond: ["#B5F0F0", "#4FC9D9"] },
};

/** Rounded pastel buildings with a few lit windows. */
function Skyline() {
  const back: [number, number, number][] = [[-6, 44, 62], [34, 30, 44], [60, 42, 72], [98, 30, 50], [206, 36, 64], [238, 44, 78], [278, 32, 52], [306, 60, 66]];
  const front: [number, number, number][] = [[-4, 40, 50], [30, 34, 36], [196, 30, 44], [312, 52, 46]];
  const base = 178;
  return (
    <g>
      {back.map(([x, w, h]) => <rect key={`b${x}`} x={x} y={base - h} width={w} height={h} rx="5" fill="#E2DAF7" />)}
      {front.map(([x, w, h]) => (
        <g key={`f${x}`}>
          <rect x={x} y={base - h} width={w} height={h} rx="5" fill="#CBBFEF" />
          {Array.from({ length: Math.floor((h - 10) / 12) }, (_, r) =>
            Array.from({ length: Math.floor((w - 6) / 10) }, (_, c) => (
              <rect key={`${r}-${c}`} x={x + 6 + c * 10} y={base - h + 8 + r * 12} width="4" height="5" rx="1" fill={(r + c + x) % 3 === 0 ? "#FFF0B8" : "#E4DDF7"} />
            )),
          )}
        </g>
      ))}
    </g>
  );
}

function Balloon({ x, y, r, fill, stripe }: { x: number; y: number; r: number; fill: string; stripe: string }) {
  return (
    <g>
      <path d={`M${x - r} ${y} a${r} ${r} 0 1 1 ${r * 2} 0 q0 ${r * 0.6} ${-r} ${r * 1.2} q${-r} ${-r * 0.6} ${-r} ${-r * 1.2} z`} fill={fill} />
      <path d={`M${x} ${y - r} q${-r * 0.45} ${r} 0 ${r * 2.2} q${r * 0.45} ${-r * 1.2} 0 ${-r * 2.2}`} fill={stripe} opacity="0.9" />
      <path d={`M${x - r * 0.3} ${y + r * 1.15} l-1 ${r * 0.45} M${x + r * 0.3} ${y + r * 1.15} l1 ${r * 0.45}`} stroke="#B07F58" strokeWidth="1" />
      <rect x={x - r * 0.35} y={y + r * 1.55} width={r * 0.7} height={r * 0.45} rx="1.5" fill="#C99A73" />
    </g>
  );
}

function Palm({ x, y, h, lean = 1 }: { x: number; y: number; h: number; lean?: number }) {
  const tx = x + lean * h * 0.25, ty = y - h;
  return (
    <g>
      <path d={`M${x} ${y} Q${x + lean * h * 0.05} ${y - h * 0.6} ${tx} ${ty}`} stroke="#C9935F" strokeWidth={Math.max(2, h / 12)} fill="none" strokeLinecap="round" />
      {[-150, -110, -70, -30, 10].map(a => (
        <ellipse key={a} cx={tx + Math.cos((a * Math.PI) / 180) * h * 0.22} cy={ty + Math.sin((a * Math.PI) / 180) * h * 0.14 + h * 0.04} rx={h * 0.24} ry={h * 0.07} fill="#4FC487" transform={`rotate(${a + 90 > 90 ? a + 180 : a} ${tx + Math.cos((a * Math.PI) / 180) * h * 0.22} ${ty + Math.sin((a * Math.PI) / 180) * h * 0.14 + h * 0.04})`} />
      ))}
      <circle cx={tx} cy={ty + h * 0.05} r={h * 0.05} fill="#A8744B" />
    </g>
  );
}

type Props = {
  world: World;
  label: string;
  mood?: BerripopMood;
  compact?: boolean;
  /** Draws this instead of the still Berri, e.g. a Berri video clip. */
  berri?: ReactNode;
};

/**
 * The little world, drawn in SVG. It grows from participation: plants for
 * answers, places for journey weeks, decorations for badges, glows for moments.
 */
export default function WorldScene({ world, label, mood = "happy", compact = false, berri }: Props) {
  const id = useId().replace(/:/g, "");
  const { regions, decorations: dec } = world;
  const scene: SceneId = world.scene ?? "meadow";
  const pal = PALETTE[scene];

  return (
    <div className={`world-scene ${compact ? "world-scene--compact" : ""}`} role="img" aria-label={label}>
      <svg viewBox="0 0 360 240" preserveAspectRatio="xMidYMax slice" aria-hidden className="world-svg">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.sky[0]} />
            <stop offset="70%" stopColor={pal.sky[1]} />
          </linearGradient>
          <linearGradient id={`${id}-meadow`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.meadow[0]} />
            <stop offset="100%" stopColor={pal.meadow[1]} />
          </linearGradient>
          <linearGradient id={`${id}-pond`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.pond[0]} />
            <stop offset="100%" stopColor={pal.pond[1]} />
          </linearGradient>
          <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A9E8F0" />
            <stop offset="100%" stopColor="#6FD0E0" />
          </linearGradient>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0%" stopColor="#FFF7C2" />
            <stop offset="60%" stopColor="#FFE38A" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#FFE38A" stopOpacity={0} />
          </radialGradient>
        </defs>

        <rect width="360" height="240" fill={`url(#${id}-sky)`} />
        {scene === "exotic" && (
          <g>
            <circle cx="96" cy="140" r="30" fill="#FFE7A8" opacity="0.55" />
            <circle cx="96" cy="140" r="20" fill="#FFD27A" />
          </g>
        )}
        {/* Soft floating shapes. */}
        <g className="w-drift">
          <ellipse cx="60" cy="40" rx="34" ry="14" fill="#FFE1D3" opacity="0.7" />
          <ellipse cx="300" cy="28" rx="26" ry="10" fill="#DDF5EA" opacity="0.8" />
        </g>
        <g className="w-drift w-drift--slow">
          <ellipse cx="190" cy="34" rx="20" ry="8" fill="#E0EEFF" opacity="0.9" />
        </g>

        {scene === "city" && <Skyline />}
        {scene === "exotic" && (
          <g>
            <path d="M-10 150 Q180 138 370 150 V206 H-10 Z" fill={`url(#${id}-sea)`} />
            <path d="M150 149 q22 -18 46 -1 z" fill="#A6DDBE" />
            <g stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.75" className="w-ripple">
              <path d="M30 160 q8 -3 16 0 q8 3 16 0" />
              <path d="M226 166 q8 -3 16 0 q8 3 16 0" />
              <path d="M300 156 q6 -2 12 0 q6 2 12 0" />
            </g>
          </g>
        )}

        {/* Floating isles (balloons in the city): journey week 3. */}
        <g className={`w-region ${regions.isles ? "is-open" : "is-hidden"}`}>
          {scene === "city" ? (
            regions.isles ? (
              <g className="w-bob">
                <Balloon x={290} y={100} r={13} fill="#FFB59A" stripe="#FFE08A" />
                <Balloon x={334} y={126} r={9} fill="#A9D3FF" stripe="#CDB8FF" />
              </g>
            ) : (
              <g fill="none" stroke="#D9CFEA" strokeWidth="2" strokeDasharray="4 6">
                <circle cx="290" cy="100" r="13" />
                <circle cx="334" cy="126" r="9" />
              </g>
            )
          ) : regions.isles ? (
            <g className="w-bob">
              <path d="M258 74 q27 -12 54 0 q-8 16 -27 18 q-19 -2 -27 -18 z" fill={scene === "exotic" ? "#FFE0B0" : "#FFD9C7"} />
              <path d="M258 74 q27 -12 54 0 q-27 6 -54 0 z" fill="#9EEBC8" />
              {scene === "exotic" ? <Palm x={280} y={72} h={22} /> : (
                <>
                  <circle cx="276" cy="62" r="6" fill="#7BDDB0" />
                  <path d="M276 68 v6" stroke="#B98A6A" strokeWidth="2" />
                </>
              )}
              <path d="M318 108 q14 -7 28 0 q-5 9 -14 10 q-9 -1 -14 -10 z" fill={scene === "exotic" ? "#FFE0B0" : "#FFD9C7"} />
              <path d="M318 108 q14 -7 28 0 q-14 4 -28 0 z" fill="#BFF3D8" />
            </g>
          ) : (
            <g fill="none" stroke="#D9CFEA" strokeWidth="2" strokeDasharray="4 6">
              <path d="M258 74 q27 -12 54 0 q-8 16 -27 18 q-19 -2 -27 -18 z" />
              <path d="M318 108 q14 -7 28 0 q-5 9 -14 10 q-9 -1 -14 -10 z" />
            </g>
          )}
        </g>

        {scene === "meadow" && <path d="M0 168 Q90 124 180 158 T360 146 V240 H0 Z" fill="#E7DEFF" />}
        {scene === "city" && <path d="M-10 178 Q180 166 370 178 V240 H-10 Z" fill="#E9E2F7" />}
        {scene === "exotic" && <path d="M-10 180 Q90 160 180 176 T370 170 V240 H-10 Z" fill="#FFE6BF" />}

        {/* Meadow (a park in the city, a jungle patch on the island): journey week 1. */}
        <g className={`w-region ${regions.meadow ? "is-open" : "is-hidden"}`}>
          <path d="M-10 196 Q70 128 168 190 V240 H-10 Z" fill={regions.meadow ? `url(#${id}-meadow)` : scene === "exotic" ? "#FFEFD8" : "#F1ECF7"} stroke={regions.meadow ? "none" : "#D9CFEA"} strokeWidth="2" strokeDasharray="4 6" />
          {regions.meadow && scene === "meadow" && [[40, 172], [66, 160], [92, 168], [120, 178], [54, 186], [104, 186]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.6" fill={FLOWERS[(i + 2) % FLOWERS.length]} />
          ))}
          {regions.meadow && scene === "city" && (
            <g>
              {[[44, 168, 11], [86, 160, 13], [126, 176, 9]].map(([x, y, r]) => (
                <g key={x}>
                  <path d={`M${x} ${y + r - 2} v10`} stroke="#B07F58" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx={x} cy={y} r={r} fill="#6EDCA6" />
                  <circle cx={x - r / 3} cy={y - r / 3} r={r / 2.6} fill="#9EEBC8" />
                </g>
              ))}
              <g stroke="#C99A73" strokeWidth="2" strokeLinecap="round">
                <path d="M58 192 h22" strokeWidth="3" /><path d="M58 186 h22" /><path d="M61 192 v5 M77 192 v5" />
              </g>
            </g>
          )}
          {regions.meadow && scene === "exotic" && (
            <g>
              {[[30, 178, -30], [52, 166, 20], [84, 160, -10], [112, 172, 30], [136, 184, -20]].map(([x, y, a]) => (
                <ellipse key={x} cx={x} cy={y} rx="12" ry="5" fill="#4FC487" transform={`rotate(${a} ${x} ${y})`} />
              ))}
              {[[44, 176], [98, 170], [124, 182]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.2" fill="#FF8FA8" />)}
            </g>
          )}
        </g>

        {/* Pond (a fountain in the city, a lagoon on the island): journey week 2. */}
        <g className={`w-region ${regions.pond ? "is-open" : "is-hidden"}`}>
          {regions.pond ? (
            <>
              <ellipse cx="252" cy="198" rx="48" ry="12" fill={`url(#${id}-pond)`} />
              {scene === "city" && (
                <g>
                  <ellipse cx="252" cy="190" rx="12" ry="4" fill="#DCD2F4" />
                  <path d="M252 190 v-14" stroke="#B7D7FF" strokeWidth="3" strokeLinecap="round" />
                  <path d="M252 176 q-10 2 -14 14 M252 176 q10 2 14 14" stroke="#CFE6FF" strokeWidth="2" fill="none" className="w-ripple" />
                </g>
              )}
              <path d="M232 198 q10 -4 20 0 q10 4 20 0" stroke="#fff" strokeWidth="2" fill="none" opacity="0.8" className="w-ripple" />
            </>
          ) : (
            <ellipse cx="252" cy="198" rx="48" ry="12" fill="none" stroke="#D9CFEA" strokeWidth="2" strokeDasharray="4 6" />
          )}
        </g>

        {scene === "exotic" && <Palm x={344} y={214} h={58} lean={-1} />}
        <path d="M-10 212 Q180 192 370 212 V250 H-10 Z" fill={scene === "city" ? "#F4EEF9" : scene === "exotic" ? "#FFF2D6" : "#FFF0DC"} />

        {/* Decorations from badges. */}
        {dec.bridge && (
          <g className="w-pop">
            <path d="M150 196 Q178 176 206 196" stroke="#C99A73" strokeWidth="5" fill="none" strokeLinecap="round" />
            {[158, 168, 178, 188, 198].map(x => <path key={x} d={`M${x} ${x < 178 ? 190 - (x - 150) / 3 : 181 + (x - 178) / 3} v8`} stroke="#B07F58" strokeWidth="2" />)}
          </g>
        )}
        {dec.arch && (
          <g className="w-pop" fill="none" stroke="#6EDCA6" strokeWidth="4" strokeLinecap="round">
            <path d="M150 214 Q150 140 180 138 Q210 140 210 214" />
            {[[154, 170], [206, 170], [180, 138]].map(([x, y]) => (
              <g key={`${x}-${y}`} fill="#9A72FF" stroke="none">
                <circle cx={x - 3} cy={y + 2} r="3.2" /><circle cx={x + 3} cy={y + 2} r="3.2" /><circle cx={x} cy={y + 7} r="3.2" />
              </g>
            ))}
          </g>
        )}
        {dec.signpost && (
          <g className="w-pop">
            <path d="M112 214 V178" stroke="#B07F58" strokeWidth="3" strokeLinecap="round" />
            <path d="M112 182 h20 l5 4 l-5 4 h-20 z" fill="#FFD9A0" />
            <path d="M112 192 h-18 l-5 4 l5 4 h18 z" fill="#CDE4FF" />
          </g>
        )}
        {dec.lantern && (
          <g className="w-pop">
            <path d="M20 214 V160 q0 -6 8 -6" stroke="#9C7A63" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle cx="30" cy="166" r="14" fill={`url(#${id}-glow)`} className="w-glow" />
            <rect x="25" y="158" width="10" height="13" rx="4" fill="#FFE7A3" stroke="#E2B65E" strokeWidth="1.5" />
          </g>
        )}
        {dec.kite && (
          <g className="w-pop w-kite">
            <path d="M58 30 l12 14 l-12 16 l-12 -16 z" fill="#FFB59A" stroke="#F08F70" strokeWidth="1.5" />
            <path d="M58 60 q8 30 -6 50 q-10 18 4 40" stroke="#E6D3C3" strokeWidth="1.2" fill="none" />
            {[72, 88, 104].map(y => <path key={y} d={`M${56 + (y % 3)} ${y} l4 3 l-4 3`} stroke="#FFB59A" strokeWidth="2" fill="none" />)}
          </g>
        )}
        {dec.chimes && (
          <g className="w-pop w-chimes" stroke="#B9AECB" strokeWidth="1.2">
            <path d="M196 0 v16 M188 16 h16" strokeWidth="2" />
            {[190, 196, 202].map((x, i) => (
              <g key={x}><path d={`M${x} 16 v${8 + i * 3}`} /><rect x={x - 1.6} y={24 + i * 3} width="3.2" height={12 - i * 2} rx="1.4" fill="#CDE4FF" stroke="none" /></g>
            ))}
          </g>
        )}
        {dec.bubbles && (
          <g className="w-bubbles" fill="none" stroke="#B7D7FF" strokeWidth="1.6">
            <circle cx="146" cy="70" r="6" /><circle cx="160" cy="54" r="4" /><circle cx="138" cy="46" r="3" />
          </g>
        )}

        {/* Glowing discoveries: one per saved moment. */}
        {GLOW_SPOTS.slice(0, world.glows).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" fill={`url(#${id}-glow)`} className="w-firefly" style={{ animationDelay: `${i * -0.9}s` }} />
        ))}

        {/* Plants: one per answer. */}
        {world.plants.map((stage, i) => (
          <Plant key={i} x={PLANT_SLOTS[i][0]} y={PLANT_SLOTS[i][1]} stage={stage} i={i} fresh={world.grewToday && i === world.plants.length - 1} />
        ))}
      </svg>

      <div className="world-cast">
        {berri ?? <BerripopMascot mood={mood} size={compact ? 58 : 84} className="world-berripop" />}
        {world.companions.nubi && <Companion id="nubi" size={compact ? 34 : 52} className="world-nubi" />}
        {world.companions.zing && <Companion id="zing" size={compact ? 30 : 46} className="world-zing" />}
        {world.companions.kobi && <Companion id="kobi" size={compact ? 32 : 50} className="world-kobi" />}
      </div>
    </div>
  );
}

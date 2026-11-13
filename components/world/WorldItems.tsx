import type { WorldItemId } from "@/lib/wardrobe";

/*
 * Things the member put into Berri's world from the treasure chest, drawn in
 * the world's own soft SVG style (viewBox 360 × 240). The rainbow sits far
 * back; the rest stand on the ground at the edges, clear of Berri in the middle.
 * The winter things (snowfall, sled, snowman, fir tree) are out only in winter.
 */

/** Flakes for the snowfall: x, size, fall time (s), delay (s). */
const FLAKES: [number, number, number, number][] = [
  [12, 1.6, 9, 0], [38, 2.2, 11, -4], [64, 1.4, 8, -6], [90, 2, 10, -2], [118, 1.6, 12, -8], [146, 2.4, 9, -5],
  [172, 1.5, 11, -1], [198, 2, 8.5, -7], [224, 1.7, 10, -3], [250, 2.3, 12, -9], [276, 1.5, 9, -4.5], [302, 2.1, 10.5, -0.5],
  [328, 1.6, 8, -6.5], [350, 2.2, 11.5, -2.5], [26, 1.3, 13, -10], [132, 1.4, 12.5, -11], [238, 1.3, 13.5, -12], [316, 1.4, 12, -7.5],
];

/** The snowfall's own little picture in the chest (the real flakes are too small to read there); viewBox 0 0 100 70. */
export function SnowfallThumb() {
  const flake = (x: number, y: number, r: number) => (
    <g key={`${x}-${y}`} stroke="#fff" strokeWidth={r / 4} strokeLinecap="round">
      {[0, 60, 120].map(a => <path key={a} d={`M${x} ${y - r} V${y + r}`} transform={`rotate(${a} ${x} ${y})`} />)}
    </g>
  );
  return (
    <g>
      <path d="M0 58 Q50 46 100 58 V70 H0 Z" fill="#fff" />
      {[[22, 18, 7], [52, 12, 5], [78, 24, 8], [38, 38, 5], [64, 42, 4.5], [12, 42, 3.5], [90, 46, 3.5]].map(([x, y, r]) => flake(x, y, r))}
    </g>
  );
}

function Snowfall() {
  return (
    <g className="w-pop">
      {/* A soft snow cap along the front of the ground. */}
      <path d="M-10 212 Q180 192 370 212 L370 219 Q340 214 310 217 Q250 206 180 205 Q110 206 60 216 Q24 213 -10 219 Z" fill="#fff" opacity="0.92" />
      {FLAKES.map(([x, r, t, delay], i) => (
        // Each flake rests at its own height (where it stays when motion is reduced) and falls through it.
        <circle key={i} cx={x} cy={(18 + i * 47) % 190} r={r * 1.5} fill="#fff" stroke="#C3D4F0" strokeWidth="0.9" className="w-flake"
          style={{ animationDuration: `${t}s`, animationDelay: `${delay}s`, ["--fy" as string]: `${(18 + i * 47) % 190}px` }} />
      ))}
    </g>
  );
}

export function WorldItemsBack({ items }: { items: Partial<Record<WorldItemId, boolean>> }) {
  if (!items.rainbow) return null;
  const bands = ["#FFB3B3", "#FFD39A", "#FFF0A0", "#B8F0C8", "#B4D8FF", "#D3C2FF"];
  return (
    <g className="w-pop" opacity="0.75" fill="none" strokeLinecap="round">
      {bands.map((c, i) => <path key={c} d={`M${40 + i * 7} 176 A${140 - i * 7} ${118 - i * 7} 0 0 1 ${320 - i * 7} 176`} stroke={c} strokeWidth="7.5" />)}
      <ellipse cx="44" cy="174" rx="22" ry="9" fill="#fff" opacity="0.9" />
      <ellipse cx="318" cy="174" rx="22" ry="9" fill="#fff" opacity="0.9" />
    </g>
  );
}

export function WorldItemsFront({ items }: { items: Partial<Record<WorldItemId, boolean>> }) {
  return (
    <g>
      {items.firtree && (
        <g className="w-pop">
          <rect x="128" y="204" width="8" height="11" rx="2" fill="#B07F58" />
          <path d="M132 160 L150 186 H114 Z" fill="#4FC487" strokeLinejoin="round" stroke="#4FC487" strokeWidth="3" />
          <path d="M132 172 L154 204 H110 Z" fill="#3FB27A" strokeLinejoin="round" stroke="#3FB27A" strokeWidth="3" />
          <path d="M132 166 L146 184 H118 Z" fill="#5ED196" />
          <path d="M119 196 Q132 190 146 194 M121 182 Q132 178 142 180" stroke="#FFE08A" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {[[124, 197, "#FF8FA8"], [138, 199, "#A9D3FF"], [146, 192, "#FFD27A"], [127, 184, "#CDB8FF"], [140, 180, "#FF8FA8"], [131, 172, "#FFD27A"]].map(([x, y, c]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill={c as string} className="w-light" style={{ animationDelay: `${(Number(x) % 5) * -0.5}s` }} />
          ))}
          <path d="M132 150 l2.4 4.8 5.3 0.8 -3.8 3.7 0.9 5.2 -4.8 -2.5 -4.8 2.5 0.9 -5.2 -3.8 -3.7 5.3 -0.8 z" fill="#FFD54A" stroke="#F0B93A" strokeWidth="0.8" strokeLinejoin="round" />
        </g>
      )}
      {items.snowman && (
        <g className="w-pop">
          <ellipse cx="226" cy="215" rx="15" ry="3" fill="#C9D6EE" opacity="0.6" />
          <circle cx="226" cy="203" r="12" fill="#fff" stroke="#DCE5F5" strokeWidth="1.2" />
          <circle cx="226" cy="185" r="9" fill="#fff" stroke="#DCE5F5" strokeWidth="1.2" />
          <circle cx="226" cy="170" r="7" fill="#fff" stroke="#DCE5F5" strokeWidth="1.2" />
          <path d="M218 186 l-10 -7 M234 186 l10 -7 M211 181 l-3 -4 M241 181 l3 -4" stroke="#A8744B" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M219 176 q7 4 14 0 l1 3 q-8 4 -16 0 z" fill="#FF8FA8" />
          <path d="M230 178 l3 9 l-4 -1 z" fill="#FF8FA8" />
          <circle cx="223.5" cy="168.5" r="1" fill="#3A2E55" />
          <circle cx="228.5" cy="168.5" r="1" fill="#3A2E55" />
          <path d="M226 171 l5 1.4 -5 1.2 z" fill="#FF9A4A" />
          {[182, 188, 199, 206].map(y => <circle key={y} cx="226" cy={y} r="1.1" fill="#6B4A8F" />)}
          <path d="M218.5 165 q7.5 -10 15 0 z" fill="#9A72FF" />
          <rect x="218" y="163.5" width="16" height="3" rx="1.5" fill="#CDB8FF" />
          <circle cx="226" cy="155.6" r="2.2" fill="#fff" />
        </g>
      )}
      {items.sled && (
        <g className="w-pop">
          <path d="M60 230 H94 q5 0 6 -4 q1 -4 -3 -4" stroke="#8E7FB0" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M66 230 v-6 M88 230 v-6" stroke="#8E7FB0" strokeWidth="2" strokeLinecap="round" />
          <rect x="60" y="219" width="34" height="5" rx="2.5" fill="#FF9FB8" />
          <rect x="62" y="215" width="30" height="4" rx="2" fill="#FFB59A" />
          <path d="M60 221 q-10 -2 -14 6" stroke="#E2B65E" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {items.lights && (
        <g className="w-pop">
          <path d="M-4 22 Q90 52 180 30 Q270 52 364 22" stroke="#B9AECB" strokeWidth="1.2" fill="none" />
          {[[24, 31], [58, 39], [92, 41], [126, 37], [158, 31], [202, 31], [234, 37], [268, 41], [302, 39], [336, 31]].map(([x, y], i) => (
            <g key={x} className="w-light" style={{ animationDelay: `${(i % 4) * -0.6}s` }}>
              <rect x={x - 1.5} y={y - 1} width="3" height="3" rx="1" fill="#8E7FB0" />
              <ellipse cx={x} cy={y + 6} rx="4.2" ry="5.4" fill={["#FFD27A", "#FFB59A", "#A9D3FF", "#CDB8FF", "#9EEBC8"][i % 5]} />
              <ellipse cx={x - 1.3} cy={y + 4.5} rx="1.2" ry="1.8" fill="#fff" opacity="0.7" />
            </g>
          ))}
        </g>
      )}
      {items.sunflowers && (
        <g className="w-pop">
          {[[14, 214, 34], [30, 220, 26], [4, 224, 20]].map(([x, y, h], i) => (
            <g key={i} className="w-sway" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * -1.1}s` }}>
              <path d={`M${x} ${y} q-2 ${-h / 2} 0 ${-h}`} stroke="#3FBF86" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d={`M${x} ${y - h * 0.4} q7 -2 9 -8 q-7 0 -9 8`} fill="#6EDCA6" />
              {Array.from({ length: 10 }, (_, k) => (
                <ellipse key={k} cx={x} cy={y - h - 6} rx="2.6" ry="5" fill="#FFCE4A" transform={`rotate(${k * 36} ${x} ${y - h})`} />
              ))}
              <circle cx={x} cy={y - h} r="4.4" fill="#A0652E" />
              <circle cx={x - 1.2} cy={y - h - 1.4} r="1.2" fill="#C98B4E" />
            </g>
          ))}
        </g>
      )}
      {items.bench && (
        <g className="w-pop">
          <rect x="44" y="196" width="46" height="5" rx="2.5" fill="#E2A877" />
          <rect x="46" y="184" width="42" height="4" rx="2" fill="#E9B88D" />
          <rect x="46" y="190" width="42" height="4" rx="2" fill="#E9B88D" />
          <path d="M50 201 v12 M84 201 v12 M50 188 v8 M84 188 v8" stroke="#B9814F" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {items.birdhouse && (
        <g className="w-pop">
          <path d="M112 220 V176" stroke="#C99A73" strokeWidth="3" strokeLinecap="round" />
          <rect x="102" y="160" width="20" height="18" rx="3" fill="#FFB59A" />
          <path d="M98 162 L112 148 L126 162 Z" fill="#9A72FF" strokeLinejoin="round" stroke="#9A72FF" strokeWidth="2" />
          <circle cx="112" cy="168" r="3.4" fill="#6B4A8F" />
          <path d="M112 174 h5" stroke="#C99A73" strokeWidth="1.6" strokeLinecap="round" />
          <g className="w-bird">
            <ellipse cx="121" cy="144" rx="5" ry="4" fill="#A9D3FF" />
            <circle cx="124" cy="141.5" r="2.8" fill="#A9D3FF" />
            <circle cx="125" cy="141" r="0.8" fill="#3A2E55" />
            <path d="M126.6 142 l2.4 0.6 -2.4 0.8 z" fill="#FFB547" />
          </g>
        </g>
      )}
      {items.swing && (
        <g className="w-pop">
          <path d="M248 214 L258 168 L268 214 M296 214 L286 168 L276 214" stroke="#C99A73" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M256 168 H288" stroke="#B9814F" strokeWidth="4" strokeLinecap="round" />
          <g className="w-swing" style={{ transformOrigin: "272px 168px" }}>
            <path d="M265 168 V200 M279 168 V200" stroke="#B9AECB" strokeWidth="1.2" />
            <rect x="261" y="199" width="22" height="4.5" rx="2.2" fill="#FF9FB8" />
          </g>
        </g>
      )}
      {items.mushroom && (
        <g transform="translate(18 -2)"><g className="w-pop">
          <rect x="314" y="190" width="28" height="30" rx="8" fill="#FFF3E2" />
          <path d="M322 220 v-12 a6 6 0 0 1 12 0 v12 z" fill="#C99A73" />
          <circle cx="331" cy="198" r="3.2" fill="#FFE08A" stroke="#E2C27A" />
          <path d="M302 194 Q328 150 354 194 Z" fill="#FF8C8C" />
          {[[316, 182, 4], [330, 172, 5], [344, 184, 3.5], [325, 188, 2.6]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#FFF3E2" />)}
        </g></g>
      )}
      {items.snowfall && <Snowfall />}
    </g>
  );
}

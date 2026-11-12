import type { WorldItemId } from "@/lib/wardrobe";

/*
 * Things the member put into Berri's world from the treasure chest, drawn in
 * the world's own soft SVG style (viewBox 360 × 240). The rainbow sits far
 * back; the rest stand on the ground at the edges, clear of Berri in the middle.
 */

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
    </g>
  );
}

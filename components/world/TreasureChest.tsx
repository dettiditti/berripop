"use client";

import { useState } from "react";
import { Check, Star } from "lucide-react";
import type { View } from "@/lib/domain/view";
import { useI18n } from "@/lib/i18n/client";
import { hapticSuccess } from "@/lib/nativeBridge";
import { buyBerriItemAction, equipBerriItemAction } from "@/lib/server/actions";
import { HEAD_ITEMS, isOffered, PRICES, WORLD_ITEMS, type HeadItemId, type ItemId, type WorldItemId } from "@/lib/wardrobe";
import { BerriStill } from "../berripop/BerriVideo";
import type { Run } from "../screens/types";
import { WorldItemsBack, WorldItemsFront } from "./WorldItems";

/** Where each world thing sits in the world (viewBox 360 × 240), for its little picture in the chest. */
const THUMB: Record<WorldItemId, string> = {
  rainbow: "30 50 300 135",
  lights: "0 14 180 44",
  sunflowers: "-10 158 52 68",
  bench: "36 174 58 44",
  birdhouse: "88 134 46 90",
  swing: "240 158 64 60",
  mushroom: "316 144 62 78",
};

function WorldThumb({ id }: { id: WorldItemId }) {
  return (
    <svg viewBox={THUMB[id]} className="chest-thumb-svg" aria-hidden>
      <WorldItemsBack items={{ [id]: true }} />
      <WorldItemsFront items={{ [id]: true }} />
    </svg>
  );
}

/**
 * Berri's treasure chest: the stars the member has collected by feeding Berri
 * and the little things they can pick with them, for Berri to wear or for
 * Berri's world. Stars cannot be bought; everything is decided on the server.
 */
export default function TreasureChest({ view, run, notify }: { view: View; run: Run; notify: (m: string) => void }) {
  const { d, plural, num } = useI18n();
  const c = d.wardrobe;
  const wardrobe = view.snapshot.wardrobe;
  const [tab, setTab] = useState<"head" | "world">("world");
  const [busy, setBusy] = useState<ItemId | null>(null);
  const balance = wardrobe?.balance ?? 0;
  const owned = new Set(wardrobe?.owned ?? []);
  const equipped = new Set(wardrobe?.equipped ?? []);
  const headOffered = HEAD_ITEMS.filter(isOffered);
  const list: ItemId[] = tab === "head" ? headOffered : [...WORLD_ITEMS];

  async function act(id: ItemId, kind: "buy" | "on" | "off") {
    if (busy) return;
    setBusy(id);
    const r = await run(kind === "buy" ? buyBerriItemAction(id) : equipBerriItemAction(id, kind === "on"));
    setBusy(null);
    if (r && kind === "buy") {
      hapticSuccess();
      notify(c.bought);
    }
  }

  return (
    <section className="card chest" aria-labelledby="chest-title">
      <div className="chest-head">
        <div>
          <h2 id="chest-title">{c.title}</h2>
          <p className="muted">{c.intro}</p>
        </div>
        <span className="chest-balance" aria-live="polite"><Star size={16} fill="currentColor" aria-hidden /> {plural(c.balance, balance)}</span>
      </div>
      <p className="chest-how">{c.howTo}</p>

      <div className="chest-tabs" role="tablist" aria-label={c.title}>
        {(["world", "head"] as const).map(k => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{c.tabs[k]}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="chest-soon">
          <BerriStill pose="wonder" className="chest-soon-berri" />
          <p>{c.wearSoon}</p>
        </div>
      ) : (
        <ul className="chest-grid">
          {list.map(id => {
            const mine = owned.has(id);
            const on = equipped.has(id);
            const head = tab === "head";
            const short = PRICES[id] - balance;
            return (
              <li key={id} className={`chest-item ${mine ? "is-mine" : ""} ${on ? "is-on" : ""}`}>
                <div className="chest-thumb">
                  {head ? <BerriStill pose="hi" wear={id as HeadItemId} className="chest-thumb-berri" /> : <WorldThumb id={id as WorldItemId} />}
                  {on && <span className="chest-on-badge"><Check size={12} strokeWidth={3.4} aria-hidden /> {head ? c.worn : c.out}</span>}
                </div>
                <strong className="chest-name">{c.items[id]}</strong>
                {mine ? (
                  <button type="button" className="btn btn--ghost btn--sm btn--block" disabled={busy !== null} onClick={() => act(id, on ? "off" : "on")}>
                    {on ? (head ? c.takeOff : c.remove) : head ? c.wear : c.place}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn--primary btn--sm btn--block chest-buy" disabled={busy !== null || short > 0} onClick={() => act(id, "buy")}>
                      <Star size={14} fill="currentColor" aria-hidden /> {num(PRICES[id])} · {c.buy}
                    </button>
                    {short > 0 && <small className="chest-need">{plural(c.need, short)}</small>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

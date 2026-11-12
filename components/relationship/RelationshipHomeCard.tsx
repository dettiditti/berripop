"use client";

import { ArrowRight, HeartHandshake } from "lucide-react";
import { BerriStill } from "../berripop/BerriVideo";
import { useRelCopy } from "./shared";

/** The way into the Kapcsolati világ from Today and the Inner World. */
export default function RelationshipHomeCard({ onOpen }: { onOpen: () => void }) {
  const c = useRelCopy();
  return (
    <section className="card rel-home-card" aria-labelledby="rel-home-title">
      <div className="rel-home-card-copy">
        <span className="eyebrow"><HeartHandshake size={13} /> {c.name}</span>
        <h2 id="rel-home-title">{c.tagline}</h2>
        <p className="muted">{c.homeCardBody}</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={onOpen}>{c.homeCardCta} <ArrowRight size={16} /></button>
      </div>
      <BerriStill pose="joy" className="rel-home-card-berri" />
    </section>
  );
}

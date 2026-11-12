"use client";

import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { WardrobeDTO } from "@/lib/wardrobe";

/** Berri's stars next to the spark on Today; a tap opens the inner world, where the treasure chest is. */
export default function StarChip({ wardrobe, onOpen }: { wardrobe: WardrobeDTO | null | undefined; onOpen: () => void }) {
  const { d, plural, num } = useI18n();
  const n = wardrobe?.balance ?? 0;
  return (
    <button type="button" className="star-chip" onClick={onOpen} title={d.wardrobe.title}>
      <Star size={16} strokeWidth={2.4} fill="currentColor" aria-hidden />
      <strong className="tabular" aria-hidden>{num(n)}</strong>
      <span className="sr-only">{plural(d.wardrobe.balance, n)} · {d.wardrobe.title}</span>
    </button>
  );
}

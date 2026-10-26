"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Counts up from `from` to `to` once mounted. */
export default function AnimatedNumber({ from, to, duration = 800 }: { from: number; to: number; duration?: number }) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, duration]);

  return <span className="tabular">{value}</span>;
}

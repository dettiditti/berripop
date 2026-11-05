"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Short silent clips of Berri, all starting and ending in the same smiling pose. */
export type BerriClip = "wave" | "wonder" | "joy" | "joy2" | "care";

/**
 * Apple's browsers (Safari, and every iPhone browser and app web view,
 * including the Berripop app) play HEVC video with transparency, so Berri
 * appears on the page itself with no background. Elsewhere (Chrome, Android)
 * the same codec would show a black box, so those get the clip with its own
 * lavender background, which the page colour matches.
 */
function canPlayTransparent(): boolean {
  const v = document.createElement("video");
  return navigator.vendor.startsWith("Apple") && v.canPlayType('video/quicktime; codecs="hvc1"') !== "";
}
const noSubscribe = () => () => {};

/**
 * Berri as a short video that plays once and rests on its last frame (the
 * neutral pose), so the next clip continues without a jump. Muted and inline,
 * as phones only autoplay silent inline video. With reduced motion, or if the
 * video cannot play, a still image is shown instead. Decorative: the text
 * next to it carries the meaning.
 */
export default function BerriVideo({ clip, className }: { clip: BerriClip; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  // Decided in the browser only; the server and first render draw an empty stage.
  const transparent = useSyncExternalStore(noSubscribe, canPlayTransparent, () => null);
  const still = useSyncExternalStore(noSubscribe, prefersReducedMotion, () => false) || failed;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {
      // Autoplay refused (e.g. low-power mode): the first frame stays.
    });
  }, [clip, transparent]);

  const base = `/berri/berri-${clip}`;
  const kind = transparent ? "berri-video--clear" : "berri-video--scene";
  return (
    <div className={`berri-video ${transparent === null ? "" : kind}${className ? ` ${className}` : ""}`} aria-hidden>
      {transparent === null ? null : still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={transparent ? `${base}.png` : `${base}.jpg`} alt="" />
      ) : (
        <video
          ref={ref}
          key={`${clip}-${transparent}`}
          src={transparent ? `${base}.mov` : `${base}.mp4`}
          poster={transparent ? undefined : `${base}.jpg`}
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

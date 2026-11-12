"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Short silent clips of Berri, all starting in the same smiling pose. */
export type BerriClip = "hello" | "wave" | "wonder" | "joy" | "joy2" | "care" | "peckish" | "hungry" | "missed" | "eat";

/**
 * How Berri can be shown without a background in this browser:
 * - "stack": wherever WebGL works (every current browser and the Berripop
 *   app), a plain H.264 clip with the colour in its top half and the
 *   transparency in its bottom half, put back together on a canvas.
 * - "mov": Apple's browsers without WebGL play HEVC video with transparency
 *   directly (its edges look jagged on iPhone, so it is only a fallback).
 * - "scene": neither, so the clip with its own lavender background.
 */
type Mode = "mov" | "stack" | "scene";

function detectMode(): Mode {
  // WebGL first, Apple included: WebKit draws HEVC transparency with jagged
  // edges on iPhone, while the stacked clip stays sharp.
  try {
    const c = document.createElement("canvas");
    if (c.getContext("webgl", { premultipliedAlpha: true })) return "stack";
  } catch {
    // No WebGL.
  }
  const v = document.createElement("video");
  if (navigator.vendor.startsWith("Apple") && v.canPlayType('video/quicktime; codecs="hvc1"') !== "") return "mov";
  return "scene";
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
  const mode = useSyncExternalStore(noSubscribe, detectMode, () => null);
  const still = useSyncExternalStore(noSubscribe, prefersReducedMotion, () => false) || failed;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {
      // Autoplay refused (e.g. low-power mode): the first frame stays.
    });
  }, [clip, mode]);

  const base = `/berri/berri-${clip}`;
  const clear = mode === "mov" || mode === "stack";
  const kind = mode === null ? "" : clear ? "berri-video--clear" : "berri-video--scene";
  return (
    <div className={`berri-video ${kind}${className ? ` ${className}` : ""}`} aria-hidden>
      {mode === null ? null : still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={clear ? `${base}.png` : `${base}.jpg`} alt="" />
      ) : mode === "stack" ? (
        <StackedClip key={clip} src={`${base}-alpha.mp4`} still={`${base}.png`} onError={() => setFailed(true)} />
      ) : (
        <video
          ref={ref}
          key={`${clip}-${mode}`}
          src={mode === "mov" ? `${base}.mov` : `${base}.mp4`}
          poster={mode === "mov" ? undefined : `${base}.jpg`}
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

/** Berri's still poses (public/berri/pose), each a transparent picture. */
export type BerriPose = "hi" | "joy" | "celebrate" | "wonder" | "care" | "calm" | "sleepy" | "peckish" | "hungry" | "eat" | "missed";
const POSE_SIZE: Record<BerriPose, [number, number]> = {
  hi: [808, 872], joy: [720, 719], celebrate: [720, 780], wonder: [720, 836], care: [720, 1033], calm: [720, 802],
  sleepy: [720, 808], peckish: [720, 796], hungry: [720, 808], eat: [720, 965], missed: [720, 799],
};
export const poseSrc = (pose: BerriPose) => `/berri/pose/${pose}.png`;

/**
 * Berri as a sharp still picture in one of the poses, standing on the page
 * like the transparent clips. A new pose pops in gently (not with reduced
 * motion). Decorative: the text next to it carries the meaning.
 */
export function BerriStill({ pose = "hi", className }: { pose?: BerriPose; className?: string }) {
  const [w, h] = POSE_SIZE[pose];
  return (
    <div className={`berri-video berri-video--clear berri-video--still${className ? ` ${className}` : ""}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- transparent still from public/berri/pose */}
      <img key={pose} className="berri-pose" src={poseSrc(pose)} alt="" width={w} height={h} decoding="async" fetchPriority="high" />
    </div>
  );
}

const VERTEX = `attribute vec2 p; varying vec2 uv;
void main() { uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.25); gl_Position = vec4(p, 0.0, 1.0); }`;
// The colour is already premultiplied (drawn over black), as the canvas expects.
// A light sharpen (the clips come from soft, compressed renders): the colour
// is pushed away from the average of its four neighbours, one texel apart.
const FRAGMENT = `precision highp float; uniform sampler2D t; uniform vec2 px; varying vec2 uv;
void main() {
  vec3 c = texture2D(t, uv).rgb;
  vec3 n = texture2D(t, uv + vec2(px.x, 0.0)).rgb + texture2D(t, uv - vec2(px.x, 0.0)).rgb
         + texture2D(t, uv + vec2(0.0, px.y)).rgb + texture2D(t, uv - vec2(0.0, px.y)).rgb;
  c = clamp(c + 0.35 * (c - n * 0.25), 0.0, 1.0);
  // The edge: the transparency is softened with its neighbours so the outline
  // is smooth instead of stepped (the matte comes from a compressed video).
  vec2 m = uv + vec2(0.0, 0.5);
  float a = (4.0 * texture2D(t, m).r
    + texture2D(t, m + vec2(px.x, 0.0)).r + texture2D(t, m - vec2(px.x, 0.0)).r
    + texture2D(t, m + vec2(0.0, px.y)).r + texture2D(t, m - vec2(0.0, px.y)).r) / 8.0;
  gl_FragColor = vec4(min(c, vec3(a)), a);
}`;

/**
 * Plays a stacked-alpha clip in a hidden video and draws each frame onto a
 * transparent canvas: the top half gives the colour, the bottom half how
 * see-through each pixel is. The still image stays underneath until the first
 * frame is drawn.
 */
function StackedClip({ src, still, onError }: { src: string; still: string; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  // The parent passes a new function on every render; the canvas is set up once per clip.
  const failRef = useRef(onError);
  failRef.current = onError;

  useEffect(() => {
    const onError = () => failRef.current();
    const v = video.current, c = canvas.current;
    if (!v || !c) return;
    const gl = c.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return onError();
    const shader = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return onError();
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    const pxLoc = gl.getUniformLocation(prog, "px");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let live = true;
    let raf = 0;
    let first = false;
    const draw = () => {
      if (!live || v.readyState < 2) return;
      if (c.width !== v.videoWidth || c.height !== v.videoHeight / 2) {
        c.width = v.videoWidth;
        c.height = v.videoHeight / 2;
        gl.viewport(0, 0, c.width, c.height);
        gl.uniform2f(pxLoc, 1 / v.videoWidth, 1 / v.videoHeight);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!first) { first = true; setDrawn(true); }
    };
    // One draw per decoded frame where supported, otherwise once per screen refresh while playing.
    type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const fv = v as FrameVideo;
    const loop = () => {
      draw();
      if (!live || v.paused || v.ended) return;
      if (fv.requestVideoFrameCallback) fv.requestVideoFrameCallback(loop);
      else raf = requestAnimationFrame(loop);
    };
    const onPlay = () => loop();
    v.addEventListener("loadeddata", draw);
    v.addEventListener("play", onPlay);
    v.addEventListener("seeked", draw);
    v.addEventListener("ended", draw);
    v.play().catch(() => draw());
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      v.removeEventListener("loadeddata", draw);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("seeked", draw);
      v.removeEventListener("ended", draw);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [src]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!drawn && <img src={still} alt="" />}
      <canvas ref={canvas} className={drawn ? undefined : "berri-video-pending"} />
      <video ref={video} className="berri-video-source" src={src} muted playsInline autoPlay preload="auto" disablePictureInPicture onError={() => failRef.current()} />
    </>
  );
}

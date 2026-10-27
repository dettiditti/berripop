import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { defaultLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/** The link preview image for shares of the homepage (and other pages without their own). */
export const alt = "Berripop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * A brand font from Google Fonts as TrueType, subset to `text`. Returns null when
 * it cannot be fetched, so the image still renders (in the default font).
 */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const h = getDictionary(defaultLocale).landing.hero;
  const text = `berripop${h.titleA}${h.titleB}${h.eyebrow}`;
  // Fredoka has no Ő ő Ű ű, so those come from Baloo 2 (as on the site).
  const fonts = (
    await Promise.all([
      googleFont("Fredoka", 600, text).then(data => data && { name: "Fredoka", data, weight: 600 as const }),
      googleFont("Baloo+2", 600, text).then(data => data && { name: "Baloo 2", data, weight: 600 as const }),
    ])
  ).filter(f => f !== null);
  const icon = await readFile(path.join(process.cwd(), "app/icon.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: "0 88px", background: "#fff8ee", fontFamily: "Fredoka, 'Baloo 2', sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: "#7b4dff" }}>berripop</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 600, lineHeight: 1.05, color: "#2b2140", letterSpacing: -2 }}>
            <span>{h.titleA}</span>
            <span style={{ color: "#7b4dff" }}>{h.titleB}</span>
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#5b5170" }}>{h.eyebrow}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 380, height: 380, borderRadius: 999, background: "#efe8ff" }}>
          <img src={src} width={300} height={300} alt="" />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

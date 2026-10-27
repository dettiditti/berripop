import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { defaultLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/** The link preview image for shares of the homepage (and other pages without their own). */
export const alt = "Berripop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const h = getDictionary(defaultLocale).landing.hero;
  const icon = await readFile(path.join(process.cwd(), "app/icon.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: "0 88px", background: "#fff8ee", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#7b4dff" }}>berripop</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: "#2b2140", letterSpacing: -2 }}>
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
    size,
  );
}

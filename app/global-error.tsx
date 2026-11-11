"use client";

import { useEffect } from "react";

/**
 * Shown when even the main layout fails (outside every page's own error
 * screen). It has its own html and body, so it cannot use the app's language
 * or styles: plain Hungarian and English. Reports the error like app/error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const at = (error.stack ?? "").split("\n").slice(1, 3).map(l => l.trim()).join(" | ");
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `global:${error.name}`, message: error.message, at, digest: error.digest, path: window.location.pathname, app: /BerripopApp\//.test(navigator.userAgent) }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);
  const code = `${error.name}: ${error.message}`.slice(0, 160);
  return (
    <html lang="hu">
      <body style={{ margin: 0, background: "#fffaf5", color: "#2b2140", fontFamily: "system-ui, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 420, margin: "0 auto", padding: "96px 20px 32px", textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Hoppá, ez most nem sikerült</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>Valami hiba történt. Próbáld újra, vagy menj vissza a kezdőlapra.</p>
          <button type="button" onClick={reset} style={{ padding: "14px", borderRadius: 14, border: 0, background: "#7654d9", color: "#fff", fontWeight: 700, fontSize: 16 }}>Újrapróbálom</button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point here */}
          <a href="/" style={{ padding: "12px", color: "#5b3fc4", fontWeight: 700 }}>Vissza a kezdőlapra</a>
          <small style={{ marginTop: 12, fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>Hibakód: {code}{error.digest ? ` (${error.digest})` : ""}</small>
        </main>
      </body>
    </html>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { isNativeApp } from "@/lib/native";

/**
 * Shown instead of a blank "Application error" page when a page crashes. The
 * member can retry or go home; a short code (the error's type and message)
 * helps to tell what broke, and the same is reported to the server logs.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { d } = useI18n();
  const e = d.appError;
  const code = `${error.name}: ${error.message}`.slice(0, 160);

  useEffect(() => {
    const at = (error.stack ?? "").split("\n").slice(1, 3).map(l => l.trim()).join(" | ");
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: error.name, message: error.message, at, digest: error.digest, path: window.location.pathname, app: isNativeApp(navigator.userAgent) }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <main className="screen app-error" role="alert">
      <h1>{e.title}</h1>
      <p className="muted">{e.body}</p>
      <button type="button" className="btn btn--primary btn--block" onClick={reset}>{e.retry}</button>
      <Link className="btn btn--ghost btn--block" href="/">{e.home}</Link>
      <small className="muted app-error-code">{e.code}: {code}{error.digest ? ` (${error.digest})` : ""}</small>
    </main>
  );
}

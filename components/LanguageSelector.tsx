"use client";

import { Languages } from "lucide-react";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { setLocale, useI18n } from "@/lib/i18n/client";
import { makeI18n } from "@/lib/i18n/format";
import { setLocaleAction } from "@/lib/server/actions";

/** Switches the UI language. Answers, XP and progress are untouched. */
export default function LanguageSelector({ onChanged, persist = false }: { onChanged?: (message: string) => void; persist?: boolean }) {
  const { locale, d } = useI18n();

  function choose(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    // Signed in: also save it on the profile so it follows you to other devices.
    if (persist) void setLocaleAction(next);
    onChanged?.(makeI18n(next).d.settings.languageChanged);
  }

  return (
    <section className="card language-card" aria-labelledby="language-title">
      <div className="language-head">
        <span className="language-icon"><Languages size={20} /></span>
        <div>
          <h2 id="language-title">{d.settings.languageTitle}</h2>
          <p className="muted">{d.settings.languageHint}</p>
        </div>
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby="language-title">
        {locales.map(l => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={locale === l}
            lang={l}
            className={`segmented-option ${locale === l ? "is-active" : ""}`}
            onClick={() => choose(l)}
          >
            <span aria-hidden>{localeLabels[l].flag}</span> {localeLabels[l].label}
          </button>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { localeLabels, locales } from "@/lib/i18n/config";
import { setLocale, useI18n } from "@/lib/i18n/client";

/** HU/EN switch for the server-rendered legal pages: stores the choice, then re-renders the page in it. */
export default function LegalLanguageToggle() {
  const { locale, d } = useI18n();
  const router = useRouter();
  return (
    <div className="lp-lang" role="radiogroup" aria-label={d.landing.languageLabel}>
      {locales.map(l => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          lang={l}
          className={locale === l ? "is-active" : ""}
          onClick={() => {
            if (l === locale) return;
            setLocale(l);
            router.refresh();
          }}
        >
          {l.toUpperCase()}
          <span className="sr-only"> {localeLabels[l].label}</span>
        </button>
      ))}
    </div>
  );
}

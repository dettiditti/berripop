import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Check } from "lucide-react";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import BerripopMascot from "./berripop/BerripopMascot";

/**
 * Two-column page for Clerk's sign-in and sign-up forms. Clerk renders the
 * actual methods (email, and Google only when it is enabled in the dashboard).
 */
export default async function AuthPage({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const dict = getDictionary(isLocale(stored) ? stored : defaultLocale);
  const a = dict.auth;
  const legalLinks = dict.account.legal;
  return (
    <main className="auth-page">
      <aside className="auth-panel">
        <Link className="auth-brand" href="/">
          <BerripopMascot mood="happy" size={44} motion="none" />
          <span>berripop</span>
        </Link>
        <div className="auth-panel-copy">
          <span className="auth-eyebrow">{a.panelEyebrow}</span>
          <h1>{a.panelTitle}</h1>
          <ul>{a.panelPoints.map(p => <li key={p}><Check size={18} strokeWidth={3} aria-hidden /> {p}</li>)}</ul>
        </div>
        <div className="auth-panel-art" aria-hidden><BerripopMascot pair mood="happy" size={120} motion="subtle" /></div>
      </aside>
      <section className="auth-form">
        <Link className="auth-back" href="/"><ArrowLeft size={16} aria-hidden /> {a.backHome}</Link>
        {children}
        <nav className="auth-legal" aria-label={dict.landing.footer.legal}>
          <Link href="/privacy">{legalLinks.privacy}</Link>
          <Link href="/terms">{legalLinks.terms}</Link>
          <Link href="/cookies">{legalLinks.cookies}</Link>
          <Link href="/contact">{legalLinks.contact}</Link>
        </nav>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Footprints, Heart, Lock, Menu, MessageCircle, Sprout, Users, X } from "lucide-react";
import { localeLabels, locales } from "@/lib/i18n/config";
import { setLocale, useI18n } from "@/lib/i18n/client";
import BerripopMascot from "./berripop/BerripopMascot";

/*
 * Signed-out landing page. CTAs use the existing Clerk routes (/sign-up,
 * /sign-in). Cards that show features still in development carry a visible
 * "Preview" or "Coming soon" badge and never link into the product.
 */

function LanguageToggle() {
  const { locale, d } = useI18n();
  return (
    <div className="lp-lang" role="radiogroup" aria-label={d.landing.languageLabel}>
      {locales.map(l => (
        <button key={l} type="button" role="radio" aria-checked={locale === l} lang={l} className={locale === l ? "is-active" : ""} onClick={() => setLocale(l)}>
          {l.toUpperCase()}
          <span className="sr-only"> {localeLabels[l].label}</span>
        </button>
      ))}
    </div>
  );
}

function Header() {
  const { d } = useI18n();
  const l = d.landing;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { href: "#how", label: l.nav.how },
    { href: "#my-path", label: l.nav.myPath },
    { href: "#our-path", label: l.nav.ourPath },
  ];

  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <a className="lp-logo" href="#top" aria-label={l.homeLabel}>
          <BerripopMascot size={36} motion="none" />
          <span>berripop</span>
        </a>
        <nav className="lp-nav" aria-label={l.navLabel}>
          <ul>{links.map(x => <li key={x.href}><a href={x.href}>{x.label}</a></li>)}</ul>
        </nav>
        <div className="lp-header-actions">
          <LanguageToggle />
          <Link className="lp-signin" href="/sign-in">{l.signIn}</Link>
          <Link className="btn lp-btn-sm" href="/sign-up">{l.start}</Link>
          <button type="button" className="lp-menu-btn" aria-expanded={open} aria-controls="lp-mobile-menu" aria-label={open ? l.menuClose : l.menuOpen} onClick={() => setOpen(v => !v)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="lp-mobile-menu" className="lp-mobile-menu">
          <ul>{links.map(x => <li key={x.href}><a href={x.href} onClick={() => setOpen(false)}>{x.label}</a></li>)}</ul>
          <div className="lp-mobile-menu-foot">
            <Link className="btn btn--ghost" href="/sign-in">{l.signIn}</Link>
            <LanguageToggle />
          </div>
        </div>
      )}
    </header>
  );
}

function HeroVisual() {
  const p = useI18n().d.landing.preview;
  return (
    <div className="lp-hero-visual" role="img" aria-label={p.label}>
      <div className="lp-blob" aria-hidden />
      <div className="lp-mascot" aria-hidden><BerripopMascot size={270} mood="happy" motion="lively" /></div>

      <div className="lp-float lp-float--daily" aria-hidden>
        <span className="lp-chip lp-chip--sun"><MessageCircle size={14} /> {p.dailyTag}</span>
        <p className="lp-float-title">{p.dailyQuestion}</p>
        <span className="lp-float-meta"><Lock size={12} /> {p.dailyMeta}</span>
      </div>

      <div className="lp-float lp-float--mypath" aria-hidden>
        <div className="lp-float-head">
          <span className="lp-chip lp-chip--lilac"><Sprout size={14} /> {p.myPathTag}</span>
          <span className="lp-badge">{p.myPathBadge}</span>
        </div>
        <p className="lp-float-title">{p.myPathTitle}</p>
        <div className="lp-steps-dots"><i className="is-done" /><i className="is-done" /><i className="is-now" /><i /><i /></div>
        <span className="lp-float-meta">{p.myPathStep}</span>
      </div>

      <div className="lp-float lp-float--ourpath" aria-hidden>
        <div className="lp-float-head">
          <span className="lp-chip lp-chip--mint"><Users size={14} /> {p.ourPathTag}</span>
          <span className="lp-badge lp-badge--soon">{p.soon}</span>
        </div>
        <p className="lp-float-title">{p.ourPathTitle}</p>
        <div className="lp-pair-row"><BerripopMascot size={30} pair motion="none" /><span>{p.ourPathBody}</span></div>
      </div>
    </div>
  );
}

function MyPathMock() {
  const m = useI18n().d.landing.myPath;
  return (
    <div className="lp-mock" aria-hidden>
      <div className="lp-mock-top">
        <span className="lp-mock-title"><BerripopMascot size={28} motion="none" /> {m.mockTitle}</span>
        <span className="lp-badge">{m.mockBadge}</span>
      </div>
      <div className="lp-mock-goal">
        <small>{m.goalLabel}</small>
        <strong>{m.goal}</strong>
        <div className="lp-progress"><span style={{ width: "42%" }} /></div>
      </div>
      <div className="lp-mock-grid">
        <div className="lp-mock-card lp-mock-card--sun">
          <small>{m.todayLabel}</small>
          <p>{m.todayTask}</p>
        </div>
        <div className="lp-mock-card">
          <small>{m.journalLabel}</small>
          <p>{m.journalSnippet}</p>
        </div>
      </div>
      <div className="lp-mock-reflection">
        <BerripopMascot size={34} mood="comforting" motion="none" />
        <div><small>{m.reflectionLabel}</small><p>{m.reflection}</p></div>
      </div>
    </div>
  );
}

function OurPathMock() {
  const o = useI18n().d.landing.ourPath;
  return (
    <div className="lp-mock lp-mock--pair" aria-hidden>
      <div className="lp-mock-top">
        <span className="lp-mock-title"><BerripopMascot size={30} pair motion="none" /></span>
        <span className="lp-badge lp-badge--soon">{o.soon}</span>
      </div>
      <div className="lp-mock-goal lp-mock-goal--mint">
        <small>{o.mockGoal}</small>
        <strong>{o.mockGoalText}</strong>
      </div>
      <div className="lp-mock-grid">
        <div className="lp-mock-card">
          <small>{o.mockYou}</small>
          <div className="lp-lines"><i /><i /><i className="is-short" /></div>
          <span className="lp-state"><Lock size={12} /> {o.mockPrivate}</span>
        </div>
        <div className="lp-mock-card">
          <small>{o.mockPartner}</small>
          <div className="lp-lines"><i /><i className="is-short" /></div>
          <span className="lp-state lp-state--shared"><Heart size={12} /> {o.mockShared}</span>
        </div>
      </div>
    </div>
  );
}

/** Signed-out landing page. */
export default function Welcome() {
  const { d } = useI18n();
  const l = d.landing;
  const valueIcons = [Footprints, Sprout, Heart];

  return (
    <div className="lp" id="top">
      <a className="lp-skip" href="#main">{l.skip}</a>
      <Header />
      <main id="main">
        <section className="lp-hero lp-container" aria-labelledby="lp-hero-title">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">{l.hero.eyebrow}</span>
            <h1 id="lp-hero-title">{l.hero.title.split(/(?<=\.)\s+/).map(part => <span key={part}>{part}</span>)}</h1>
            <p className="lp-lead">{l.hero.body}</p>
            <div className="lp-cta-row">
              <Link className="btn btn--lg lp-btn-main" href="/sign-up">{l.start} <ArrowRight size={18} /></Link>
              <a className="btn btn--ghost btn--lg" href="#how">{l.hero.secondary}</a>
            </div>
            <p className="lp-trust">{l.hero.trust}</p>
          </div>
          <div className="lp-hero-art">
            <HeroVisual />
            <p className="lp-note">{l.preview.note}</p>
          </div>
        </section>

        <section className="lp-section lp-container" aria-labelledby="lp-values-title">
          <div className="lp-section-head">
            <span className="lp-eyebrow">{l.values.eyebrow}</span>
            <h2 id="lp-values-title">{l.values.title}</h2>
          </div>
          <ul className="lp-values">
            {l.values.items.map((v, i) => {
              const Icon = valueIcons[i];
              return (
                <li key={v.title} className={`lp-value lp-value--${i + 1}`}>
                  <span className="lp-value-icon" aria-hidden><Icon size={22} /></span>
                  <h3>{v.title}</h3>
                  <p>{v.body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="my-path" className="lp-section lp-container lp-split" aria-labelledby="lp-mypath-title">
          <div className="lp-split-copy">
            <span className="lp-eyebrow">{l.myPath.eyebrow}</span>
            <h2 id="lp-mypath-title">{l.myPath.title}</h2>
            <p className="lp-lead">{l.myPath.body}</p>
            <ul className="lp-checks">{l.myPath.points.map(x => <li key={x}><Check size={18} strokeWidth={3} /> {x}</li>)}</ul>
          </div>
          <MyPathMock />
        </section>

        <section id="our-path" className="lp-section lp-container lp-split lp-split--reverse" aria-labelledby="lp-ourpath-title">
          <div className="lp-split-copy">
            <span className="lp-eyebrow">{l.ourPath.eyebrow} <span className="lp-badge lp-badge--soon">{l.ourPath.soon}</span></span>
            <h2 id="lp-ourpath-title">{l.ourPath.title}</h2>
            <p className="lp-lead">{l.ourPath.body}</p>
            <ul className="lp-pair-points">
              {l.ourPath.points.map(x => <li key={x.title}><strong>{x.title}</strong><span>{x.body}</span></li>)}
            </ul>
            <p className="lp-note lp-note--left">{l.ourPath.note}</p>
          </div>
          <OurPathMock />
        </section>

        <section id="how" className="lp-section lp-container" aria-labelledby="lp-how-title">
          <div className="lp-section-head">
            <span className="lp-eyebrow">{l.how.eyebrow}</span>
            <h2 id="lp-how-title">{l.how.title}</h2>
          </div>
          <ol className="lp-how">
            {l.how.steps.map((s, i) => (
              <li key={s.title}>
                <span className="lp-how-num" aria-hidden>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-container" aria-labelledby="lp-privacy-title">
          <div className="lp-privacy">
            <div>
              <span className="lp-eyebrow lp-eyebrow--light"><Lock size={14} /> {l.privacy.eyebrow}</span>
              <h2 id="lp-privacy-title">{l.privacy.title}</h2>
            </div>
            <ul>{l.privacy.items.map(x => <li key={x}><Check size={18} strokeWidth={3} /> <span>{x}</span></li>)}</ul>
          </div>
        </section>

        <section className="lp-section lp-container" aria-labelledby="lp-final-title">
          <div className="lp-final">
            <BerripopMascot pair size={92} mood="excited" motion="subtle" />
            <h2 id="lp-final-title">{l.final.title}</h2>
            <p>{l.final.body}</p>
            <Link className="btn btn--white btn--lg" href="/sign-up">{l.start} <ArrowRight size={18} /></Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo"><BerripopMascot size={32} motion="none" /><span>berripop</span></span>
            <p>{l.footer.tagline}</p>
          </div>
          <nav aria-label={l.footer.product}>
            <h3>{l.footer.product}</h3>
            <ul>
              <li><a href="#how">{l.nav.how}</a></li>
              <li><a href="#my-path">{l.nav.myPath}</a></li>
              <li><a href="#our-path">{l.nav.ourPath}</a></li>
              <li><Link href="/pricing">{l.footer.pricing}</Link></li>
            </ul>
          </nav>
          <nav aria-label={l.footer.account}>
            <h3>{l.footer.account}</h3>
            <ul>
              <li><Link href="/sign-in">{l.signIn}</Link></li>
              <li><Link href="/sign-up">{l.footer.signUp}</Link></li>
            </ul>
          </nav>
          <nav aria-label={l.footer.legal}>
            <h3>{l.footer.legal}</h3>
            <ul>
              <li><Link href="/privacy">{d.account.legal.privacy}</Link></li>
              <li><Link href="/terms">{d.account.legal.terms}</Link></li>
              <li><Link href="/cookies">{d.account.legal.cookies}</Link></li>
              <li><Link href="/contact">{d.account.legal.contact}</Link></li>
            </ul>
          </nav>
          <div className="lp-footer-lang">
            <h3>{l.languageLabel}</h3>
            <LanguageToggle />
          </div>
        </div>
        <div className="lp-container lp-footer-bottom"><small>{l.footer.copyright}</small></div>
      </footer>
    </div>
  );
}

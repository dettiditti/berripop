"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, BookHeart, Check, Footprints, Lock, Map, Menu, MessageCircle, Sparkles, Target, X } from "lucide-react";
import { PLAN_LIMITS, PRICES } from "@/lib/billing/plans";
import { localeLabels, locales } from "@/lib/i18n/config";
import { setLocale, useI18n } from "@/lib/i18n/client";
import BerripopMascot from "./berripop/BerripopMascot";

/*
 * Signed-out landing page. Rendered on the server for signed-out visitors (see
 * app/page.tsx), so the copy is in the HTML. CTAs use the existing Clerk routes
 * (/sign-up, /sign-in) and /pricing. The product previews are drawn from the
 * app's real content (built-in questions, journey titles) with sample answers,
 * and only show features that exist; "coming soon" items carry a visible badge.
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
    { href: "#product", label: l.nav.product },
    { href: "#how", label: l.nav.how },
    { href: "#paths", label: l.nav.paths },
    { href: "#pricing", label: l.nav.pricing },
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

function Hero() {
  const { d } = useI18n();
  const l = d.landing;
  const h = l.hero;
  const question = d.content.questions.j05.text;
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-container lp-hero-inner">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">{h.eyebrow}</span>
          <h1 id="lp-hero-title"><span>{h.titleA}</span> <span className="lp-hero-accent">{h.titleB}</span></h1>
          <p className="lp-lead">{h.body}</p>
          <div className="lp-cta-row">
            <Link className="btn btn--lg lp-btn-main" href="/sign-up">{l.start} <ArrowRight size={18} aria-hidden /></Link>
            <a className="btn btn--ghost btn--lg" href="#product">{h.secondary}</a>
          </div>
          <ul className="lp-trust">{h.trust.map(x => <li key={x}><Check size={16} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
        </div>

        <div className="lp-hero-stage" role="img" aria-label={h.visualLabel}>
          <div className="lp-stage-disc" aria-hidden />
          <p className="lp-stage-bubble" aria-hidden>{h.bubble}</p>
          <div className="lp-stage-mascot" aria-hidden><BerripopMascot size={250} mood="happy" motion="subtle" /></div>
          <div className="lp-stage-card" aria-hidden>
            <span className="lp-chip lp-chip--sun"><MessageCircle size={14} /> {h.cardTag}</span>
            <p className="lp-stage-question">{question}</p>
            <div className="lp-stage-meta">
              <span>{h.cardMeta}</span>
              <span><Lock size={12} /> {h.cardPrivate}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- product previews (real content, sample answers) ---------- */

type TabId = "daily" | "journey" | "goals" | "journal";
const TAB_ICONS = { daily: MessageCircle, journey: Map, goals: Target, journal: BookHeart } satisfies Record<TabId, unknown>;

function DailyPreview() {
  const { d } = useI18n();
  const p = d.landing.product;
  const q = d.content.questions.j05;
  return (
    <div className="lp-screen">
      <div className="lp-screen-top">
        <span className="lp-chip lp-chip--sun"><MessageCircle size={14} /> {d.landing.hero.cardTag}</span>
        <span className="lp-screen-meta">{d.landing.hero.cardMeta}</span>
      </div>
      <p className="lp-screen-question">{q.text}</p>
      <p className="lp-screen-prompt">{q.prompts[0]}</p>
      <div className="lp-screen-answer">{p.daily.answer}</div>
      <div className="lp-screen-row">
        <span className="lp-switch" aria-hidden><i /></span>
        <span>{p.daily.share}</span>
        <span className="lp-screen-btn">{p.daily.save}</span>
      </div>
    </div>
  );
}

function JourneyPreview() {
  const { d, t } = useI18n();
  const p = d.landing.product.journey;
  const done = 4;
  const today = done + 1;
  return (
    <div className="lp-screen">
      <div className="lp-screen-top">
        <strong className="lp-screen-title">{p.chapter}</strong>
        <span className="lp-screen-meta">{t(p.progress, { done })}</span>
      </div>
      {[0, 1, 2].map(w => (
        <div key={w} className="lp-week">
          <span className="lp-week-name">{d.journey.weeks[`w${w + 1}` as "w1"].theme}</span>
          <ol className="lp-nodes">
            {Array.from({ length: 7 }, (_, i) => {
              const day = w * 7 + i + 1;
              const state = day <= done ? "is-done" : day === today ? "is-today" : "";
              return (
                <li key={day} className={`${state} ${day % 7 === 0 ? "is-challenge" : ""}`}>
                  {day % 7 === 0 ? <Sparkles size={13} /> : day <= done ? <Check size={13} strokeWidth={3} /> : day}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      <div className="lp-screen-today">
        <span className="lp-chip">{p.today}</span>
        <span>{d.journey.titles[today - 1]}</span>
      </div>
    </div>
  );
}

function GoalsPreview() {
  const p = useI18n().d.landing.product.goals;
  return (
    <div className="lp-screen">
      <small className="lp-screen-label">{p.goalLabel}</small>
      <p className="lp-screen-goal">{p.goal}</p>
      <div className="lp-progress" aria-hidden><span style={{ width: "34%" }} /></div>
      <small className="lp-screen-label">{p.stepsLabel}</small>
      <ul className="lp-steps">
        {p.steps.map((s, i) => (
          <li key={s} className={i === 0 ? "is-done" : ""}>
            <span className="lp-step-box">{i === 0 && <Check size={12} strokeWidth={3} />}</span>
            {s}
          </li>
        ))}
      </ul>
      <div className="lp-screen-today lp-screen-today--lilac">
        <Footprints size={16} aria-hidden />
        <span><strong>{p.journeyLabel}</strong> · {p.journeyText}</span>
      </div>
    </div>
  );
}

function JournalPreview() {
  const p = useI18n().d.landing.product.journal;
  return (
    <div className="lp-screen">
      <div className="lp-screen-top">
        <strong className="lp-screen-title">{p.date}</strong>
        <span className="lp-screen-meta"><Lock size={12} /> {p.privateNote}</span>
      </div>
      <p className="lp-screen-entry">{p.entry}</p>
      <span className="lp-screen-btn lp-screen-btn--soft"><Sparkles size={14} /> {p.ask}</span>
      <div className="lp-reflection">
        <BerripopMascot size={40} mood="comforting" motion="none" />
        <div><small>{p.reflectionLabel}</small><p>{p.reflection}</p></div>
      </div>
    </div>
  );
}

const PREVIEWS: Record<TabId, () => React.JSX.Element> = { daily: DailyPreview, journey: JourneyPreview, goals: GoalsPreview, journal: JournalPreview };

function ProductShowcase() {
  const { d } = useI18n();
  const p = d.landing.product;
  const ids: TabId[] = ["daily", "journey", "goals", "journal"];
  const [active, setActive] = useState<TabId>("daily");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ daily: null, journey: null, goals: null, journal: null });
  const tab = p.tabs[active];
  const Preview = PREVIEWS[active];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const i = ids.indexOf(active);
    const next = e.key === "ArrowRight" ? ids[(i + 1) % ids.length]
      : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length]
        : e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="product" className="lp-section lp-product" aria-labelledby="lp-product-title">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{p.eyebrow}</span>
          <h2 id="lp-product-title">{p.title}</h2>
          <p>{p.body}</p>
        </div>
        <div className="lp-tabs" role="tablist" aria-label={p.tabsLabel} onKeyDown={onKeyDown}>
          {ids.map(id => {
            const Icon = TAB_ICONS[id];
            return (
              <button
                key={id}
                ref={el => { tabRefs.current[id] = el; }}
                type="button"
                role="tab"
                id={`lp-tab-${id}`}
                aria-selected={active === id}
                aria-controls="lp-tabpanel"
                tabIndex={active === id ? 0 : -1}
                className={active === id ? "is-active" : ""}
                onClick={() => setActive(id)}
              >
                <Icon size={18} aria-hidden /> {p.tabs[id].label}
              </button>
            );
          })}
        </div>
        <div className="lp-tabpanel" id="lp-tabpanel" role="tabpanel" aria-labelledby={`lp-tab-${active}`}>
          <div className="lp-tabpanel-copy">
            <span className="lp-live"><i aria-hidden /> {p.live}</span>
            <h3>{tab.title}</h3>
            <p>{tab.body}</p>
            <ul className="lp-checks">{tab.points.map(x => <li key={x}><Check size={18} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
          </div>
          <div className="lp-device" aria-hidden key={active}>
            <span className="lp-device-tag">{p.example}</span>
            <Preview />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const l = useI18n().d.landing;
  const moods = ["curious", "encouraging", "proud"] as const;
  return (
    <section id="how" className="lp-section" aria-labelledby="lp-how-title">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{l.how.eyebrow}</span>
          <h2 id="lp-how-title">{l.how.title}</h2>
        </div>
        <ol className="lp-path">
          {l.how.steps.map((s, i) => (
            <li key={s.title} className={`lp-path-stop lp-path-stop--${i + 1}`}>
              <div className="lp-path-marker" aria-hidden>
                <BerripopMascot size={72} mood={moods[i]} motion="none" />
                <span className="lp-path-num">{i + 1}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Paths() {
  const p = useI18n().d.landing.paths;
  return (
    <section id="paths" className="lp-section" aria-labelledby="lp-paths-title">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{p.eyebrow}</span>
          <h2 id="lp-paths-title">{p.title}</h2>
        </div>
        <div className="lp-paths">
          <article className="lp-pathcard lp-pathcard--my" aria-labelledby="lp-my-title">
            <div className="lp-pathcard-head">
              <BerripopMascot size={78} mood="thinking" motion="none" />
              <div>
                <span className="lp-pathcard-name">{p.my.name}</span>
                <h3 id="lp-my-title">{p.my.title}</h3>
              </div>
            </div>
            <p className="lp-pathcard-body">{p.my.body}</p>
            <ul className="lp-checks">{p.my.points.map(x => <li key={x}><Check size={18} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
            <p className="lp-pathcard-note"><Sparkles size={15} aria-hidden /> {p.my.aiNote}</p>
          </article>

          <article className="lp-pathcard lp-pathcard--our" aria-labelledby="lp-our-title">
            <div className="lp-pathcard-head">
              <BerripopMascot size={64} pair mood="excited" motion="none" />
              <div>
                <span className="lp-pathcard-name">{p.our.name}</span>
                <h3 id="lp-our-title">{p.our.title}</h3>
              </div>
            </div>
            <p className="lp-pathcard-body">{p.our.body}</p>
            <ul className="lp-checks">{p.our.points.map(x => <li key={x}><Check size={18} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
            <div className="lp-soon">
              <span className="lp-badge lp-badge--soon">{p.our.soon}</span>
              <div><strong>{p.our.soonTitle}</strong><p>{p.our.soonBody}</p></div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const p = useI18n().d.landing.privacy;
  return (
    <section className="lp-section" aria-labelledby="lp-privacy-title">
      <div className="lp-container">
        <div className="lp-privacy">
          <div className="lp-privacy-head">
            <span className="lp-eyebrow lp-eyebrow--light"><Lock size={14} aria-hidden /> {p.eyebrow}</span>
            <h2 id="lp-privacy-title">{p.title}</h2>
            <Link className="lp-privacy-link" href="/privacy">{p.link} <ArrowRight size={16} aria-hidden /></Link>
          </div>
          <dl className="lp-privacy-list">
            {p.items.map(x => (
              <div key={x.title}>
                <dt>{x.title}</dt>
                <dd>{x.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { d, t, money } = useI18n();
  const l = d.landing;
  const p = l.pricing;
  const free = PLAN_LIMITS.free;
  const freePoints = p.freePoints.map(x => t(x, { goals: free.activeGoals, circles: free.ownedCircles, ai: free.aiPerPeriod, journal: free.journalAiPerPeriod }));
  return (
    <section id="pricing" className="lp-section" aria-labelledby="lp-pricing-title">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{p.eyebrow}</span>
          <h2 id="lp-pricing-title">{p.title}</h2>
        </div>
        <div className="lp-plans">
          <article className="lp-plan lp-plan--free">
            <h3>{p.freeName}</h3>
            <p className="lp-plan-price">{money(0, PRICES.monthly.currency)}</p>
            <p className="lp-plan-note">{p.freeNote}</p>
            <ul className="lp-checks">{freePoints.map(x => <li key={x}><Check size={18} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
            <Link className="btn btn--lg btn--block lp-btn-main" href="/sign-up">{l.start} <ArrowRight size={18} aria-hidden /></Link>
          </article>
          <article className="lp-plan lp-plan--premium">
            <h3>{p.premiumName}</h3>
            <p className="lp-plan-price">{t(p.premiumFrom, { price: money(PRICES.monthly.amount, PRICES.monthly.currency) })}</p>
            <p className="lp-plan-note">{p.premiumNote}</p>
            <ul className="lp-checks">{p.premiumPoints.map(x => <li key={x}><Check size={18} strokeWidth={3} aria-hidden /> {x}</li>)}</ul>
            <Link className="btn btn--ghost btn--lg btn--block" href="/pricing">{p.compare}</Link>
          </article>
        </div>
      </div>
    </section>
  );
}

/** Signed-out landing page. */
export default function Welcome() {
  const { d, locale } = useI18n();
  const l = d.landing;

  // Keep <html lang> in the chosen language.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="lp" id="top">
      <a className="lp-skip" href="#main">{l.skip}</a>
      <Header />
      <main id="main">
        <Hero />
        <ProductShowcase />
        <HowItWorks />
        <Paths />
        <Privacy />
        <Pricing />

        <section className="lp-section" aria-labelledby="lp-final-title">
          <div className="lp-container">
            <div className="lp-final">
              <BerripopMascot pair size={92} mood="excited" motion="subtle" />
              <h2 id="lp-final-title">{l.final.title}</h2>
              <p>{l.final.body}</p>
              <Link className="btn btn--white btn--lg" href="/sign-up">{l.start} <ArrowRight size={18} aria-hidden /></Link>
            </div>
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
              <li><a href="#product">{l.nav.product}</a></li>
              <li><a href="#how">{l.nav.how}</a></li>
              <li><a href="#paths">{l.nav.paths}</a></li>
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

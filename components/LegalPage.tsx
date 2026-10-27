import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { legal, type LegalKind } from "@/lib/legal/content";
import BerripopMascot from "./berripop/BerripopMascot";
import LegalLanguageToggle from "./LegalLanguageToggle";

/** Public legal page, in the visitor's language. */
export default async function LegalPage({ kind }: { kind: LegalKind }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const L = legal[isLocale(stored) ? stored : defaultLocale];
  const doc = L.docs[kind];
  return (
    <div className="legal">
      <header className="legal-top">
        <Link className="legal-brand" href="/"><BerripopMascot size={32} motion="none" /> berripop</Link>
        <div className="legal-top-actions">
          <LegalLanguageToggle />
          <Link className="btn btn--text btn--inline" href="/"><ArrowLeft size={16} aria-hidden /> {L.back}</Link>
        </div>
      </header>
      <main className="legal-main">
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        <small className="muted">{L.updated}</small>
        {doc.sections.map(s => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body?.map(p => <p key={p}>{p}</p>)}
            {s.list && <ul>{s.list.map(item => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
        <nav className="legal-nav" aria-label={L.docs.privacy.title}>
          {(Object.keys(L.nav) as LegalKind[]).map(k => (
            <Link key={k} href={`/${k}`} aria-current={k === kind ? "page" : undefined}>{L.nav[k]}</Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

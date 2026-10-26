import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { legal, type LegalKind } from "@/lib/legal/content";
import BerripopMascot from "./berripop/BerripopMascot";

/** Highlights `[[…]]` placeholders so missing operator data is impossible to overlook. */
function withPlaceholders(text: string): ReactNode {
  return text.split(/(\[\[[^\]]+\]\])/g).map((part, i) =>
    part.startsWith("[[") ? <mark key={i} className="legal-todo">{part.slice(2, -2)}</mark> : <Fragment key={i}>{part}</Fragment>);
}

/** Public legal page (draft), in the visitor's language. */
export default async function LegalPage({ kind }: { kind: LegalKind }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const L = legal[isLocale(stored) ? stored : defaultLocale];
  const doc = L.docs[kind];
  return (
    <div className="legal">
      <header className="legal-top">
        <Link className="legal-brand" href="/"><BerripopMascot size={32} motion="none" /> berripop</Link>
        <Link className="btn btn--text btn--inline" href="/"><ArrowLeft size={16} aria-hidden /> {L.back}</Link>
      </header>
      <main className="legal-main">
        <p className="legal-draft" role="note"><TriangleAlert size={18} aria-hidden /> <span>{withPlaceholders(L.draftBanner)}</span></p>
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        <small className="muted">{withPlaceholders(L.updated)}</small>
        {doc.sections.map(s => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body?.map(p => <p key={p}>{withPlaceholders(p)}</p>)}
            {s.list && <ul>{s.list.map(item => <li key={item}>{withPlaceholders(item)}</li>)}</ul>}
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

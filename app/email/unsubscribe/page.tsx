import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { unsubscribeByLink } from "@/lib/server/emailReminders";

export const metadata: Metadata = { title: "Berripop", robots: { index: false, follow: false } };

async function dictionary() {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  return getDictionary(isLocale(stored) ? stored : defaultLocale).emailReminder;
}

/** The member confirms with a button, so a mail scanner that opens the link changes nothing. */
async function confirm(form: FormData) {
  "use server";
  const ok = await unsubscribeByLink(String(form.get("u") ?? ""), String(form.get("t") ?? "")).catch(() => false);
  // The result page carries no member id or signature.
  redirect(`/email/unsubscribe?done=${ok ? "1" : "0"}`);
}

/** The unsubscribe link at the bottom of the reminder emails (no sign-in needed). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { u = "", t = "", done } = await searchParams;
  const e = await dictionary();
  const message = done === "1" ? e.unsubscribeDone : done === "0" || !u || !t ? e.unsubscribeInvalid : null;
  return (
    <main className="unsubscribe-page">
      <section className="card stack-sm">
        <h1>{e.unsubscribeTitle}</h1>
        {message ? <p>{message}</p> : (
          <>
            <p className="muted">{e.unsubscribeBody}</p>
            <form action={confirm}>
              <input type="hidden" name="u" value={u} />
              <input type="hidden" name="t" value={t} />
              <button type="submit" className="btn btn--primary btn--block">{e.unsubscribeButton}</button>
            </form>
          </>
        )}
        <Link href="/app">{e.toApp}</Link>
      </section>
    </main>
  );
}

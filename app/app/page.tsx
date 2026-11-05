import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import BerriVideo from "@/components/berripop/BerriVideo";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: "Berripop", robots: { index: false, follow: false } };

/**
 * Where the Berripop phone app starts: Berri waves hello, then sign up or sign
 * in. Members who are already signed in go straight on to the app. The page
 * is open to anyone; it is simply not linked from the website.
 */
export default async function AppWelcomePage() {
  const { userId } = await auth();
  if (userId) redirect("/");
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const w = getDictionary(isLocale(stored) ? stored : defaultLocale).appWelcome;
  return (
    <main className="berri-stage app-welcome">
      <BerriVideo clip="wave" className="app-welcome-berri" />
      <div className="app-welcome-copy">
        <h1>{w.title}</h1>
        <p>{w.body}</p>
      </div>
      <div className="app-welcome-actions">
        <Link className="btn btn--primary btn--lg btn--block" href="/sign-up">{w.start}</Link>
        <Link className="btn btn--ghost btn--lg btn--block" href="/sign-in">{w.signIn}</Link>
      </div>
    </main>
  );
}

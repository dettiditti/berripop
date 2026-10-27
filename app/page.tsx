import type { Metadata } from "next";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import KozosApp from "@/components/KozosApp";
import Welcome from "@/components/Welcome";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/** Title and description in the visitor's language (crawlers without the cookie get Hungarian). */
export async function generateMetadata(): Promise<Metadata> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  const d = getDictionary(locale);
  return {
    title: d.meta.title,
    description: d.meta.description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Berripop",
      title: d.meta.title,
      description: d.meta.description,
      locale: locale === "hu" ? "hu_HU" : "en_GB",
      alternateLocale: [locale === "hu" ? "en_GB" : "hu_HU"],
    },
    twitter: { card: "summary_large_image", title: d.meta.title, description: d.meta.description },
  };
}

/**
 * Signed-out visitors get the landing page rendered on the server (readable
 * without JavaScript and by search engines); signed-in members get the app.
 */
export default async function HomePage() {
  const { userId } = await auth();
  return userId ? <KozosApp /> : <Welcome />;
}

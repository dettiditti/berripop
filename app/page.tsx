import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import KozosApp from "@/components/KozosApp";
import Welcome from "@/components/Welcome";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { APP_HOME, isNativeApp } from "@/lib/native";
import { relationshipEnabled } from "@/lib/server/relationship";
import { thoughtEnabled } from "@/lib/server/thought";

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
 * Inside the phone app there is no marketing page: signed-out visitors (for
 * example right after signing out) go to the app's own welcome instead.
 */
export default async function HomePage() {
  const { userId } = await auth();
  if (!userId && isNativeApp((await headers()).get("user-agent"))) redirect(APP_HOME);
  return userId ? <KozosApp relationshipEnabled={relationshipEnabled()} /> : <Welcome thoughtEnabled={thoughtEnabled()} />;
}

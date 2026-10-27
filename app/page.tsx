import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import KozosApp from "@/components/KozosApp";
import Welcome from "@/components/Welcome";
import { defaultLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

const d = getDictionary(defaultLocale);

export const metadata: Metadata = {
  title: d.meta.title,
  description: d.meta.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Berripop",
    title: d.meta.title,
    description: d.meta.description,
    locale: "hu_HU",
    alternateLocale: ["en_GB"],
  },
  twitter: { card: "summary_large_image", title: d.meta.title, description: d.meta.description },
};

/**
 * Signed-out visitors get the landing page rendered on the server (readable
 * without JavaScript and by search engines); signed-in members get the app.
 */
export default async function HomePage() {
  const { userId } = await auth();
  return userId ? <KozosApp /> : <Welcome />;
}

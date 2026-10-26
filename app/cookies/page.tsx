import type { Metadata } from "next";
import { cookies } from "next/headers";
import LegalPage from "@/components/LegalPage";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { legal } from "@/lib/legal/content";

export async function generateMetadata(): Promise<Metadata> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  return { title: `${legal[isLocale(stored) ? stored : defaultLocale].docs.cookies.title} · Berripop` };
}

export default function Page() {
  return <LegalPage kind="cookies" />;
}

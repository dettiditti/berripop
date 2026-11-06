import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppStart from "@/components/AppStart";

export const metadata: Metadata = { title: "Berripop", robots: { index: false, follow: false } };

/**
 * Where the Berripop phone app starts: Berri waves hello and asks a few short
 * questions, then sign up or sign in. Members who are already signed in go
 * straight on to the app. The page is open to anyone; it is simply not linked
 * from the website.
 */
export default async function AppWelcomePage() {
  const { userId } = await auth();
  if (userId) redirect("/");
  return <AppStart />;
}

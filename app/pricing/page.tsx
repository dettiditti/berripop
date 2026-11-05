import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PricingPage from "@/components/billing/PricingPage";
import { publicSalesInfo } from "@/lib/billing/sales";
import { isTestMode } from "@/lib/billing/stripe";
import { isNativeApp } from "@/lib/native";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // Nothing is sold inside the phone app (App Store rules).
  if (isNativeApp((await headers()).get("user-agent"))) redirect("/");
  const { from } = await searchParams;
  return <PricingPage from={from} testMode={isTestMode()} sales={publicSalesInfo(process.env)} />;
}

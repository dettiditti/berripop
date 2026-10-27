import PricingPage from "@/components/billing/PricingPage";
import { publicSalesInfo } from "@/lib/billing/sales";
import { isTestMode } from "@/lib/billing/stripe";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return <PricingPage from={from} testMode={isTestMode()} sales={publicSalesInfo(process.env)} />;
}

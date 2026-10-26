import CheckoutReturn from "@/components/billing/CheckoutReturn";

export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  return <CheckoutReturn kind="success" sessionId={session_id} />;
}

import { handleWebhook } from "@/lib/server/billing";

// Stripe needs the exact raw body to verify the signature.
export async function POST(req: Request) {
  const { status, body } = await handleWebhook(await req.text(), req.headers.get("stripe-signature"));
  return new Response(body, { status });
}

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { processClerkEvent } from "@/lib/account/clerkWebhook";
import { deleteAccountForRemovedLogin } from "@/lib/server/account";

// Clerk signs each event (Svix); CLERK_WEBHOOK_SIGNING_SECRET comes from the Clerk dashboard.
export async function POST(req: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) return new Response("Clerk webhook not configured", { status: 503 });
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    return new Response(await processClerkEvent(event, { deleteAccount: deleteAccountForRemovedLogin }));
  } catch (err) {
    // A 5xx makes Clerk retry the event.
    console.error("clerk webhook failed", event.type, err instanceof Error ? err.message : err);
    return new Response("Processing failed", { status: 500 });
  }
}

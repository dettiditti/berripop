import { handleAppleNotification } from "@/lib/server/apple";

// App Store Server Notifications (version 2). Set this URL in App Store Connect
// (App Information → App Store Server Notifications) for both production and sandbox.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid", { status: 400 });
  }
  const status = await handleAppleNotification(body);
  return new Response(status === 200 ? "ok" : "error", { status });
}

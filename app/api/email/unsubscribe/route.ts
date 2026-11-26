import { unsubscribeByLink } from "@/lib/server/emailReminders";

/**
 * One-click unsubscribe (RFC 8058) from the List-Unsubscribe header of the
 * reminder emails: a POST with the signed link's `u` and `t`. Mail apps call
 * it without the member signing in; the signature (lib/email/reminder) makes
 * sure a link only ever unsubscribes its own member. Answers without details.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const ok = await unsubscribeByLink(url.searchParams.get("u") ?? "", url.searchParams.get("t") ?? "").catch(() => false);
  return new Response(null, { status: ok ? 200 : 400 });
}

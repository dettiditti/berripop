import { sendDuePushes } from "@/lib/server/push";

/**
 * The hourly notification job for the iPhone app: Berri's thought of the day
 * in the morning and the afternoon "Don't forget yourself" reminder, each at
 * the hour the member chose (lib/push/schedule). Called every hour by the
 * GitHub Actions workflow (.github/workflows/push-hourly.yml), since Vercel's
 * Hobby plan runs crons only once a day; the daily Vercel cron in vercel.json
 * stays as a backstop. Running it more often, or twice at once, is harmless:
 * the database lets each kind reach a member at most once a day (push_sends).
 * Takes no parameters. Vercel and the workflow send
 * `Authorization: Bearer <CRON_SECRET>`; without it every call is refused.
 * Responds with counts only, never a member, token or text.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const pushes = await sendDuePushes().catch(() => { console.error("[push] job failed"); return null; });
  return Response.json({ pushes });
}

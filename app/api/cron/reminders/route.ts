import { sendDailyReminders } from "@/lib/server/push";

/**
 * Daily reminder for the iPhone app (vercel.json crons, 17:00 UTC: 18:00 in
 * Hungarian winter, 19:00 in summer). Same protection as the daily job: Vercel
 * sends `Authorization: Bearer <CRON_SECRET>`; without it every call is refused.
 * Responds with counts only.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const reminders = await sendDailyReminders().catch(() => null);
  return Response.json({ reminders });
}

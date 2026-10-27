import { applyRetention } from "@/lib/server/retention";

/**
 * Daily job (vercel.json crons): applies the configured retention periods
 * (nothing is deleted until one is set). Vercel sends `Authorization: Bearer
 * <CRON_SECRET>`; without CRON_SECRET the route refuses every call.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const retention = await applyRetention().catch(() => null);
  return Response.json({ retention });
}

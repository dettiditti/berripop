/**
 * The origin Stripe sends members back to (checkout success/cancel, portal).
 * Prefer a configured URL over request headers, so a forged Host or
 * X-Forwarded-Host can never steer a return link elsewhere: APP_URL if set,
 * else the production domain Vercel provides; headers only for local and
 * preview deployments.
 */
type Env = Record<string, string | undefined>;
type Headers = { get(name: string): string | null };

export function appOrigin(env: Env, h: Headers): string {
  const configured = env.APP_URL || (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (configured) return configured.replace(/\/+$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

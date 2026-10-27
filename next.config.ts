import type { NextConfig } from "next";

/**
 * Security headers on every response. No Content-Security-Policy yet: Clerk,
 * Google Fonts and Vercel Analytics need a tested allowlist first (see
 * docs/production-readiness.md). HSTS is set by Vercel on its domains.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;

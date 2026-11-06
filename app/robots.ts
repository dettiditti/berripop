import type { MetadataRoute } from "next";

/**
 * /robots.txt: the public pages may be crawled; the API and the signed-in
 * account pages may not (they hold nothing for search engines).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/settings", "/billing", "/join"] },
    sitemap: "https://www.berripop.com/sitemap.xml",
    host: "https://www.berripop.com",
  };
}

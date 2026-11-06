import type { MetadataRoute } from "next";

/** /sitemap.xml: the public pages, for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.berripop.com";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Dashboards, account pages and the API are private; everything else is the public catalogue.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/teacher", "/student", "/profile", "/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

import type { MetadataRoute } from "next";

// Personal single-user app: disallow all crawlers so it never gets indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

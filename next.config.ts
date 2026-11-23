import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Personal single-user app: tell crawlers not to index anything, including
  // API responses that have no HTML <meta> tag to carry the directive.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;

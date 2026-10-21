import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/sitio.html",
        },
      ],
    };
  },
};

export default nextConfig;

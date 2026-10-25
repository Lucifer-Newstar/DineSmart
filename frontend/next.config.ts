import type { NextConfig } from "next";
import { securityHeaders } from "./src/content-security-policy";

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL,
          development: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
      {
        source: "/health",
        destination: `${apiProxyTarget}/health`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

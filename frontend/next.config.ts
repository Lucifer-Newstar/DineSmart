import type { NextConfig } from "next";

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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

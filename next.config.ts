import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  distDir: process.env.FORMAN_NEXT_DIST_DIR ?? ".next",
  headers: async () => [
    {
      source: "/vendor/altcha/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
  output: process.env.FORMAN_NEXT_DIST_DIR ? undefined : "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

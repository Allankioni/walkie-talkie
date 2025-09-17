import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  // Allow tunneling/proxy origins (e.g., ngrok) during development to avoid dev cross-origin warnings
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: [
    "https://*.ngrok-free.app",
    "http://*.ngrok-free.app",
  ],
};

export default nextConfig;

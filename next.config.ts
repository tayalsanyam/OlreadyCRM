import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep postgres as a Node external — avoids broken vendor-chunks in dev/prod
  serverExternalPackages: ["postgres"],
};

export default nextConfig;

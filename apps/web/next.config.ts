import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: allow importing workspace packages without pre-building them.
  transpilePackages: [
    "@demo/contracts",
    "@demo/domain",
    "@demo/eve-adapter",
    "@demo/flue-adapter",
  ],
};

export default nextConfig;

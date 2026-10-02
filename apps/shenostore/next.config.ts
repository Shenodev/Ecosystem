import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @shenodev/db and @shenodev/auth publish TypeScript source directly (their
  // entry points are src/*.ts), so Next has to compile them rather than treat
  // them as pre-built node_modules.
  transpilePackages: ["@shenodev/auth", "@shenodev/db", "@shenodev/ui"],
};

export default nextConfig;
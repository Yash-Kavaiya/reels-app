import { join } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@reelcraft/db", "@reelcraft/project", "@reelcraft/templates"],
  turbopack: { root: join(import.meta.dirname, "../..") },
};

export default config;

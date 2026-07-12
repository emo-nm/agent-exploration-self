import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: transpile workspace packages imported as raw TS.
  transpilePackages: [
    "@demo/contracts",
    "@demo/persistence",
    "@demo/eve-adapter",
    "@demo/flue-adapter",
    "@demo/mastra-adapter",
  ],
  // Keep native / heavy Node deps external to the server bundle (they are only
  // reachable from route handlers, never the client).
  serverExternalPackages: ["pg", "drizzle-orm"],
  // Pin the trace root to this monorepo (a stray lockfile elsewhere on the
  // machine otherwise confuses Next's workspace-root inference).
  outputFileTracingRoot: process.cwd() + "/../..",
  webpack(config) {
    // Workspace packages (e.g. @demo/persistence) use NodeNext-style ".js"
    // import specifiers that point at ".ts" source. Next's webpack does not
    // resolve those by default, so teach it to try ".ts" for a ".js" request.
    // (Adapter/package finding — see docs/log/2026-07-11-web-ui-notes.md.)
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;

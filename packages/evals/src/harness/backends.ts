// Per-candidate service start config for the durability harness.
// One entry per backend: how to launch the dev server, which port, and how to
// probe health. Notes on start-mode quirks live in
// docs/log/2026-07-11-durability-harness-notes.md.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/evals/src/harness -> repo root
export const REPO_ROOT = resolve(HERE, "../../../..");

export type BackendName = "eve" | "flue" | "mastra";
export const BACKENDS: BackendName[] = ["eve", "flue", "mastra"];

export interface BackendConfig {
  name: BackendName;
  /** Working directory for the child process (the app package). */
  cwd: string;
  /** Argv passed to pnpm (we always spawn via the workspace `dev` script). */
  command: string;
  args: string[];
  /** The mode we drive it in (all three: dev — see notes for why). */
  startMode: "dev" | "start";
  port: number;
  /** Absolute health URL polled until the service is up. */
  healthUrl: string;
  /** Base URL the adapter talks to. */
  baseUrl: string;
  /** Returns true when a parsed health body means "ready". */
  healthOk: (body: unknown) => boolean;
}

function app(name: string): string {
  return resolve(REPO_ROOT, "apps", name);
}

export const BACKEND_CONFIGS: Record<BackendName, BackendConfig> = {
  // eve dev serves the durable HTTP API on 3001; --no-ui keeps it headless.
  // eve build/start needs Vercel-shaped bundling to load workspace TS pkgs
  // (see eve baseline notes), so the harness drives dev mode.
  eve: {
    name: "eve",
    cwd: app("eve"),
    command: "pnpm",
    args: ["dev"],
    startMode: "dev",
    port: 3001,
    healthUrl: "http://localhost:3001/eve/v1/health",
    baseUrl: "http://localhost:3001",
    healthOk: (b) =>
      typeof b === "object" && b !== null && "status" in b
        ? true
        : b === "ok" || b === true,
  },
  // flue build output can't load raw-TS workspace pkgs yet (baseline notes),
  // so dev mode only. flue dev serves the Hono app (incl. /health) on 3002.
  flue: {
    name: "flue",
    cwd: app("flue"),
    command: "pnpm",
    args: ["dev"],
    startMode: "dev",
    port: 3002,
    healthUrl: "http://localhost:3002/health",
    baseUrl: "http://localhost:3002",
    healthOk: (b) =>
      typeof b === "object" && b !== null && (b as { status?: string }).status === "ok",
  },
  // mastra ships a built-in GET /health ({"success":true}) that shadows custom
  // routes; the demo's richer health is at /demo/health. dev mode on 3003.
  mastra: {
    name: "mastra",
    cwd: app("mastra"),
    command: "pnpm",
    args: ["dev"],
    startMode: "dev",
    port: 3003,
    healthUrl: "http://localhost:3003/demo/health",
    baseUrl: "http://localhost:3003",
    healthOk: (b) =>
      typeof b === "object" && b !== null && (b as { status?: string }).status === "ok",
  },
};

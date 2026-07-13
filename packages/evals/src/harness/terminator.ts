// Process control for the durability harness: spawn a backend dev server in its
// own process group, wait for health, and SIGKILL the whole group at a
// checkpoint (simulating a hard crash — no graceful shutdown). Restart is just
// spawn again; the durable store is the shared Postgres, so state survives.
import { spawn, type ChildProcess } from "node:child_process";
import type { BackendConfig } from "./backends.js";

export interface RunningService {
  child: ChildProcess;
  pid: number;
  config: BackendConfig;
  startedAt: number;
}

export interface SpawnOptions {
  /** Extra env (DEMO_* failure hooks, DATABASE_URL, OPENROUTER_API_KEY, ...). */
  env?: Record<string, string | undefined>;
  /** Pipe child stdio into these sinks (default: swallow). */
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

/** Spawn the backend's dev server detached (own process group) so we can kill the tree. */
export function spawnService(
  config: BackendConfig,
  opts: SpawnOptions = {},
): RunningService {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opts.env } as NodeJS.ProcessEnv,
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  if (opts.onStdout) child.stdout?.on("data", opts.onStdout);
  if (opts.onStderr) child.stderr?.on("data", opts.onStderr);
  if (child.pid === undefined) {
    throw new Error(`failed to spawn ${config.name}: no pid`);
  }
  return { child, pid: child.pid, config, startedAt: Date.now() };
}

export interface HealthOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}

export interface HealthResult {
  healthy: boolean;
  attempts: number;
  ms: number;
  lastError?: string;
}

/** Poll the health URL until healthOk returns true or the timeout elapses. */
export async function waitForHealth(
  config: BackendConfig,
  opts: HealthOptions = {},
): Promise<HealthResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 500;
  const doFetch = opts.fetchImpl ?? fetch;
  const start = Date.now();
  let attempts = 0;
  let lastError: string | undefined;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const res = await doFetch(config.healthUrl);
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* plain text health body */
      }
      if (res.ok && config.healthOk(body)) {
        return { healthy: true, attempts, ms: Date.now() - start };
      }
      lastError = `status=${res.status} body=${text.slice(0, 120)}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await sleep(intervalMs);
  }
  return { healthy: false, attempts, ms: Date.now() - start, lastError };
}

/**
 * SIGKILL the service's process group (hard crash checkpoint). Negative pid
 * targets the whole group created by `detached: true`. Resolves once the child
 * has exited (or immediately if already gone).
 */
export function killService(
  service: RunningService,
  signal: NodeJS.Signals = "SIGKILL",
): Promise<void> {
  return new Promise((resolve) => {
    if (service.child.exitCode !== null || service.child.signalCode !== null) {
      resolve();
      return;
    }
    service.child.once("exit", () => resolve());
    try {
      process.kill(-service.pid, signal);
    } catch {
      try {
        service.child.kill(signal);
      } catch {
        /* already dead */
      }
      resolve();
    }
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

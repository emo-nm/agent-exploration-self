// The durability runner: wires a live ScenarioContext (durable repo + process
// control + model driver) and drives the 8-scenario suite for one backend.
//
// Modes:
//  - live: model driver enabled iff OPENROUTER_API_KEY is set; model-gated
//    phases run. Uses shared Postgres (DATABASE_URL) so state survives restarts.
//  - dry:  model forced off; only the model-free scenarios (2,3,7,8) run to
//    completion, exercising start/health, SIGKILL+restart, approval flips and
//    duplicate publish directly against the repo. The rest report BLOCKED.
import {
  createDemoRepo,
  createPool,
  countPublicationEffects,
  truncateDemoTables,
  InMemoryDemoRepo,
  type DemoRepo,
  type EffectCountRow,
} from "@demo/persistence";
import { resolve } from "node:path";
import { BACKEND_CONFIGS, REPO_ROOT, type BackendName } from "./backends.js";
import { spawnService, waitForHealth, killService, type RunningService } from "./terminator.js";
import { createDriver } from "./drivers.js";
import { foldEffectRows } from "./exactly-once.js";
import { runScenario } from "./scenario-machine.js";
import { SCENARIOS, scenarioByNumber, type ScenarioDef } from "./scenarios.js";
import type { ScenarioContext } from "./context.js";
import { summarize, writeReport, renderTable, type ScenarioResult, type RunReport } from "./report.js";

export interface RunnerOptions {
  backend: BackendName;
  dry: boolean;
  scenario?: number;
  /** Skip spawning the service (unit/CI without ports). Default false. */
  noService?: boolean;
  healthTimeoutMs?: number;
}

export async function runDurability(opts: RunnerOptions): Promise<RunReport> {
  const config = BACKEND_CONFIGS[opts.backend];
  const databaseUrlSet = !!process.env.DATABASE_URL;
  const modelAvailable = !opts.dry && !!process.env.OPENROUTER_API_KEY;
  const startedAt = Date.now();

  // Durable store: Postgres when DATABASE_URL is set (shared with the backend
  // across restarts), else an in-memory double (recreated on reset).
  const pool: ReturnType<typeof createPool> | undefined = databaseUrlSet
    ? createPool()
    : undefined;
  let repo: DemoRepo = createDemoRepo();

  const reset = async () => {
    if (pool) {
      await truncateDemoTables(pool);
    } else {
      repo = new InMemoryDemoRepo();
      ctx.repo = repo;
    }
  };

  const countEffects = async (): Promise<EffectCountRow[]> => {
    if (pool) return countPublicationEffects(pool);
    return foldEffectRows((repo as InMemoryDemoRepo).listEffects());
  };

  // --- process control -----------------------------------------------------
  let service: RunningService | undefined;
  let serviceHealthy = false;

  const startService = async () => {
    if (opts.noService) {
      serviceHealthy = true;
      return;
    }
    service = spawnService(config, {
      env: {
        DATABASE_URL: process.env.DATABASE_URL,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        PORT: String(config.port),
      },
    });
    const health = await waitForHealth(config, {
      timeoutMs: opts.healthTimeoutMs ?? 60_000,
    });
    serviceHealthy = health.healthy;
    if (!health.healthy) {
      throw new Error(
        `${config.name} did not become healthy (${health.attempts} attempts, ${health.ms}ms): ${health.lastError}`,
      );
    }
  };

  const killServiceFn = async () => {
    if (opts.noService || !service) return;
    await killService(service);
    service = undefined;
  };

  const ctx: ScenarioContext = {
    backend: opts.backend,
    repo,
    modelAvailable,
    driver: createDriver({ config, threads: repo }),
    countEffects,
    reset,
    startService,
    killService: killServiceFn,
    attempts: { publish: 0, restarts: 0 },
    bag: {},
  };

  // Best-effort initial boot + health. On failure we still run scenarios;
  // process-control phases will fail loudly and report the boot error.
  let bootError: string | undefined;
  try {
    await startService();
  } catch (err) {
    bootError = (err as Error).message;
  }

  const chosen: ScenarioDef[] = opts.scenario
    ? [scenarioByNumber(opts.scenario)].filter(Boolean) as ScenarioDef[]
    : SCENARIOS;
  if (opts.scenario && chosen.length === 0) {
    throw new Error(`no such scenario: ${opts.scenario}`);
  }

  const results: ScenarioResult[] = [];
  for (const def of chosen) {
    // fresh per-scenario counters + scratchpad
    ctx.attempts = { publish: 0, restarts: 0 };
    ctx.bag = {};
    const run = await runScenario(def.phases, ctx);
    results.push({
      n: def.n,
      id: def.id,
      title: def.title,
      injection: def.injection,
      status: run.status,
      ms: run.ms,
      attempts: { ...ctx.attempts },
      phases: run.phases,
    });
  }

  await killServiceFn();
  await pool?.end();

  const report = summarize(
    opts.backend,
    opts.dry ? "dry" : "live",
    modelAvailable,
    databaseUrlSet,
    startedAt,
    results,
  );
  if (bootError) {
    (report as RunReport & { bootError?: string }).bootError = bootError;
  }
  (report as RunReport & { serviceHealthy?: boolean }).serviceHealthy = serviceHealthy;
  return report;
}

export async function runAndReport(opts: RunnerOptions): Promise<RunReport> {
  const report = await runDurability(opts);
  const path = await writeReport(report, resolve(REPO_ROOT, ".eval-results"));
  console.log(renderTable(report));
  console.log(`\nresult written: ${path}`);
  const b = (report as RunReport & { bootError?: string }).bootError;
  if (b) console.log(`service boot: ${b}`);
  return report;
}

export { renderTable };

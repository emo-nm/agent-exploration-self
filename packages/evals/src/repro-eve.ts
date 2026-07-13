// Throwaway: reproduce eve durability scenario 1 (kill-during-model-work) in
// isolation with instrumentation + eve server logs. Determines whether the
// harness "fetch failed" on resume-turn is a driver bug or a real eve defect.
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEveAdapter } from "@demo/eve-adapter";
import { createDemoRepo, createPool, truncateDemoTables } from "@demo/persistence";

const ROOT = resolve(import.meta.dirname, "../../..");
const EVE_CWD = resolve(ROOT, "apps/eve");
const LOG = resolve(ROOT, ".eval-results/eve-repro-server.log");
const HEALTH = "http://localhost:3001/eve/v1/health";
const BASE = "http://localhost:3001";
const PROMPT = "How does durable execution survive a restart?";

function log(m: string) {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
}

function spawnEve(tag: string) {
  appendFileSync(LOG, `\n\n===== EVE SPAWN (${tag}) ${new Date().toISOString()} =====\n`);
  const child = spawn("pnpm", ["dev"], {
    cwd: EVE_CWD,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: "3001" },
  });
  child.stdout?.on("data", (c) => appendFileSync(LOG, `[out] ${c}`));
  child.stderr?.on("data", (c) => appendFileSync(LOG, `[err] ${c}`));
  return child;
}

async function waitHealth(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(HEALTH);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function kill(child: import("node:child_process").ChildProcess): Promise<void> {
  return new Promise((res) => {
    if (child.exitCode !== null || child.signalCode !== null) return res();
    child.once("exit", () => res());
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
      res();
    }
  });
}

async function main() {
  writeFileSync(LOG, `eve repro log ${new Date().toISOString()}\n`);
  const pool = createPool();
  await truncateDemoTables(pool);
  const repo = createDemoRepo();
  const threadId = `thr_eve_repro_${Date.now()}`;
  const adapter = createEveAdapter({ host: BASE, threads: repo });

  // --- boot ---
  let eve = spawnEve("initial");
  log(`spawned eve pid=${eve.pid}, waiting health`);
  if (!(await waitHealth(60_000))) throw new Error("eve did not boot");
  log("eve healthy");

  // --- turn 1: drive the research turn ---
  const t1 = Date.now();
  const { events, state } = await adapter.sendMessage(threadId, PROMPT);
  log(`turn1 done in ${Date.now() - t1}ms, ${events.length} events, sessionId=${state.sessionId}`);
  const thread = await repo.getThread(threadId);
  log(`saved continuation sessionId=${(thread?.continuationStateJson as any)?.sessionId}`);

  // --- kill (hard crash) ---
  await kill(eve);
  log("eve KILLED (SIGKILL group)");

  // --- restart ---
  eve = spawnEve("restart");
  log(`respawned eve pid=${eve.pid}`);
  if (!(await waitHealth(60_000))) throw new Error("eve did not reboot");
  log("eve healthy again after restart");

  // --- resume-turn: this is the phase that failed with 'fetch failed' ---
  log("RESUME: sending 'continue' on the same thread (150s AbortController budget)");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 150_000);
  const t2 = Date.now();
  try {
    // Reproduce the adapter path but observe first-event timing by streaming
    // the eve session directly from the saved cursor.
    const th = await repo.getThread(threadId);
    const saved = th?.continuationStateJson as any;
    log(`resume from saved cursor: sessionId=${saved?.sessionId} keys=${Object.keys(saved ?? {})}`);
    const { events: ev2, state: st2 } = await adapter.sendMessage(threadId, "continue");
    log(`RESUME OK in ${Date.now() - t2}ms, ${ev2.length} events, newSessionId=${st2.sessionId}`);
  } catch (err) {
    log(`RESUME FAILED in ${Date.now() - t2}ms: ${(err as Error).name}: ${(err as Error).message}`);
    const cause = (err as any)?.cause;
    if (cause) log(`  cause: ${cause?.code ?? ""} ${cause?.message ?? JSON.stringify(cause)}`);
  } finally {
    clearTimeout(timer);
  }

  await kill(eve);
  await pool.end();
  log("done; eve server log at .eval-results/eve-repro-server.log");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

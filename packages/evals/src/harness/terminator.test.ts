import { describe, it, expect } from "vitest";
import { spawnService, waitForHealth, killService } from "./terminator.js";
import type { BackendConfig } from "./backends.js";

// A throwaway backend config that runs a trivial node HTTP server, so process
// control (spawn -> health -> SIGKILL) is exercised without a framework/model.
function fakeConfig(port: number): BackendConfig {
  const script = `
    const http = require('http');
    http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok'}))}).listen(${port});
  `;
  return {
    name: "eve",
    cwd: process.cwd(),
    command: process.execPath,
    args: ["-e", script],
    startMode: "dev",
    port,
    healthUrl: `http://localhost:${port}/health`,
    baseUrl: `http://localhost:${port}`,
    healthOk: (b) => (b as { status?: string })?.status === "ok",
  };
}

describe("terminator", () => {
  it("spawns a service, sees it healthy, then SIGKILLs it", async () => {
    const cfg = fakeConfig(38111);
    const svc = spawnService(cfg);
    try {
      const health = await waitForHealth(cfg, { timeoutMs: 8000, intervalMs: 100 });
      expect(health.healthy).toBe(true);
      expect(health.attempts).toBeGreaterThan(0);
    } finally {
      await killService(svc);
    }
    // After kill, health should no longer resolve within a short timeout.
    const after = await waitForHealth(cfg, { timeoutMs: 1000, intervalMs: 100 });
    expect(after.healthy).toBe(false);
  });

  it("reports unhealthy when nothing is listening", async () => {
    const cfg = fakeConfig(38112);
    const health = await waitForHealth(cfg, { timeoutMs: 800, intervalMs: 100 });
    expect(health.healthy).toBe(false);
    expect(health.lastError).toBeTruthy();
  });
});

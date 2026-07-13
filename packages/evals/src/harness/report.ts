// Machine-readable results (.eval-results/, gitignored) + a printable summary
// table. The JSON feeds the metrics section of the decision memo (timings and
// attempt counts per scenario); the table is for the console.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BackendName } from "./backends.js";
import type { PhaseResult, ScenarioStatus } from "./scenario-machine.js";

export interface ScenarioResult {
  n: number;
  id: string;
  title: string;
  injection: string;
  status: ScenarioStatus;
  ms: number;
  attempts: { publish: number; restarts: number };
  phases: PhaseResult[];
}

export interface RunReport {
  backend: BackendName;
  mode: "live" | "dry";
  modelAvailable: boolean;
  databaseUrlSet: boolean;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  scenarios: ScenarioResult[];
  summary: {
    passed: number;
    failed: number;
    blocked: number;
    total: number;
  };
}

export function summarize(
  backend: BackendName,
  mode: "live" | "dry",
  modelAvailable: boolean,
  databaseUrlSet: boolean,
  startedAt: number,
  scenarios: ScenarioResult[],
): RunReport {
  const summary = {
    passed: scenarios.filter((s) => s.status === "passed").length,
    failed: scenarios.filter((s) => s.status === "failed").length,
    blocked: scenarios.filter((s) => s.status === "blocked").length,
    total: scenarios.length,
  };
  const finished = Date.now();
  return {
    backend,
    mode,
    modelAvailable,
    databaseUrlSet,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    totalMs: finished - startedAt,
    scenarios,
    summary,
  };
}

export async function writeReport(
  report: RunReport,
  dir = resolve(process.cwd(), ".eval-results"),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const path = resolve(dir, `durability-${report.backend}-${report.mode}-${stamp}.json`);
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

const STATUS_MARK: Record<string, string> = {
  passed: "PASS",
  failed: "FAIL",
  blocked: "BLOCKED",
};

export function renderTable(report: RunReport): string {
  const lines: string[] = [];
  lines.push(
    `Durability suite — backend=${report.backend} mode=${report.mode} ` +
      `model=${report.modelAvailable ? "yes" : "no(blocked)"} db=${report.databaseUrlSet ? "postgres" : "in-memory"}`,
  );
  lines.push("-".repeat(78));
  lines.push(pad("#", 3) + pad("scenario", 34) + pad("status", 9) + pad("ms", 7) + "pub/restart");
  for (const s of report.scenarios) {
    lines.push(
      pad(String(s.n), 3) +
        pad(s.id, 34) +
        pad(STATUS_MARK[s.status] ?? s.status, 9) +
        pad(String(s.ms), 7) +
        `${s.attempts.publish}/${s.attempts.restarts}`,
    );
  }
  lines.push("-".repeat(78));
  lines.push(
    `total=${report.summary.total} pass=${report.summary.passed} ` +
      `fail=${report.summary.failed} blocked=${report.summary.blocked} (${report.totalMs}ms)`,
  );
  return lines.join("\n");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length);
}

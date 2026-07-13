import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarize, writeReport, renderTable, type ScenarioResult } from "./report.js";

const scenarios: ScenarioResult[] = [
  {
    n: 8,
    id: "duplicate-publication-request",
    title: "duplicate publish -> exactly-once",
    injection: "two publish calls, same key",
    status: "passed",
    ms: 12,
    attempts: { publish: 2, restarts: 0 },
    phases: [{ name: "publish-artifact", status: "ok", ms: 5 }],
  },
  {
    n: 1,
    id: "kill-during-model-work",
    title: "kill mid-turn",
    injection: "SIGKILL mid-turn",
    status: "blocked",
    ms: 1,
    attempts: { publish: 0, restarts: 0 },
    phases: [{ name: "drive-research-turn", status: "blocked", ms: 0 }],
  },
];

describe("report", () => {
  it("summarizes counts", () => {
    const r = summarize("eve", "dry", false, true, Date.now() - 100, scenarios);
    expect(r.summary).toEqual({ passed: 1, failed: 0, blocked: 1, total: 2 });
    expect(r.backend).toBe("eve");
    expect(r.databaseUrlSet).toBe(true);
  });

  it("renders a table with a total line", () => {
    const r = summarize("flue", "live", true, false, Date.now(), scenarios);
    const table = renderTable(r);
    expect(table).toContain("backend=flue");
    expect(table).toContain("duplicate-publication-request");
    expect(table).toMatch(/total=2 pass=1 fail=0 blocked=1/);
  });

  it("writes machine-readable JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "eval-"));
    const r = summarize("mastra", "dry", false, false, Date.now(), scenarios);
    const path = await writeReport(r, dir);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    expect(parsed.backend).toBe("mastra");
    expect(parsed.scenarios).toHaveLength(2);
    expect(parsed.summary.total).toBe(2);
  });
});

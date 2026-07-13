// A tiny, pure scenario state machine. A scenario is an ordered list of phases;
// each phase runs against a shared context and returns a short detail string.
// The machine records a timed trace and stops at the first failure or blocked
// phase (marking the rest skipped). Model-driven phases (needsModel) are gated:
// when the context reports no model available, they are recorded BLOCKED rather
// than run — so the whole harness is runnable today and simply reports what is
// blocked on the API key. Fully deterministic and unit-tested with fake phases.
import type { ScenarioContext } from "./context.js";

export type PhaseStatus = "ok" | "failed" | "blocked" | "skipped";

export interface Phase {
  name: string;
  /** Requires a live model loop (gated when no OPENROUTER_API_KEY). */
  needsModel?: boolean;
  run: (ctx: ScenarioContext) => Promise<string | void>;
}

export interface PhaseResult {
  name: string;
  status: PhaseStatus;
  ms: number;
  detail?: string;
  error?: string;
}

export type ScenarioStatus = "passed" | "failed" | "blocked";

export interface ScenarioRun {
  status: ScenarioStatus;
  phases: PhaseResult[];
  ms: number;
}

export async function runScenario(
  phases: Phase[],
  ctx: ScenarioContext,
): Promise<ScenarioRun> {
  const results: PhaseResult[] = [];
  const start = Date.now();
  let status: ScenarioStatus = "passed";
  let stopped = false;

  for (const phase of phases) {
    if (stopped) {
      results.push({ name: phase.name, status: "skipped", ms: 0 });
      continue;
    }
    if (phase.needsModel && !ctx.modelAvailable) {
      results.push({
        name: phase.name,
        status: "blocked",
        ms: 0,
        detail: "requires OPENROUTER_API_KEY (model loop)",
      });
      status = "blocked";
      stopped = true;
      continue;
    }
    const t0 = Date.now();
    try {
      const detail = await phase.run(ctx);
      results.push({
        name: phase.name,
        status: "ok",
        ms: Date.now() - t0,
        detail: detail || undefined,
      });
    } catch (err) {
      results.push({
        name: phase.name,
        status: "failed",
        ms: Date.now() - t0,
        error: (err as Error).message,
      });
      status = "failed";
      stopped = true;
    }
  }

  return { status, phases: results, ms: Date.now() - start };
}

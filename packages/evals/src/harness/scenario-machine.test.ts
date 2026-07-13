import { describe, it, expect } from "vitest";
import { runScenario, type Phase } from "./scenario-machine.js";
import type { ScenarioContext } from "./context.js";

function fakeCtx(modelAvailable: boolean): ScenarioContext {
  return {
    backend: "eve",
    repo: {} as ScenarioContext["repo"],
    modelAvailable,
    driver: { backend: "eve", sendMessage: async () => [], streamEvents: async function* () {} },
    countEffects: async () => [],
    reset: async () => {},
    startService: async () => {},
    killService: async () => {},
    attempts: { publish: 0, restarts: 0 },
    bag: {},
  };
}

const ok = (name: string): Phase => ({ name, run: async () => `${name} done` });
const boom = (name: string): Phase => ({ name, run: async () => { throw new Error("boom"); } });
const model = (name: string): Phase => ({ name, needsModel: true, run: async () => "ran model" });

describe("runScenario", () => {
  it("runs all phases and passes", async () => {
    const run = await runScenario([ok("a"), ok("b")], fakeCtx(true));
    expect(run.status).toBe("passed");
    expect(run.phases.map((p) => p.status)).toEqual(["ok", "ok"]);
    expect(run.phases[0]?.detail).toBe("a done");
  });

  it("stops at first failure and skips the rest", async () => {
    const run = await runScenario([ok("a"), boom("b"), ok("c")], fakeCtx(true));
    expect(run.status).toBe("failed");
    expect(run.phases.map((p) => p.status)).toEqual(["ok", "failed", "skipped"]);
    expect(run.phases[1]?.error).toBe("boom");
  });

  it("blocks a model phase when no model is available; skips the rest", async () => {
    const run = await runScenario([ok("a"), model("b"), ok("c")], fakeCtx(false));
    expect(run.status).toBe("blocked");
    expect(run.phases.map((p) => p.status)).toEqual(["ok", "blocked", "skipped"]);
  });

  it("runs a model phase when the model is available", async () => {
    const run = await runScenario([model("b")], fakeCtx(true));
    expect(run.status).toBe("passed");
    expect(run.phases[0]?.status).toBe("ok");
  });
});

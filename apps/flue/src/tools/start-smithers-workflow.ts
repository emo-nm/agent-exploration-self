// Pattern B (test plan / handoff section 4): the product agent launches a
// BOUNDED Smithers job. Ownership rule under fire: the Flue session stays the
// durable parent; the Smithers run does the work; neither owns the other's
// durability. The model can only pick from a fixed allowlist — never a path,
// never a URL (handoff security note).
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import type { ToolFactoryContext } from "./context.ts";

const WORKFLOW_ALLOWLIST: Record<string, string> = {
  "compare-backends": "workflows/compare-backends.tsx",
  "flue-research": "workflows/flue-research.tsx",
};

const SMITHERS_DIR = resolve(import.meta.dirname, "../../../../.smithers");

export function startSmithersWorkflowTool(ctx: ToolFactoryContext) {
  return defineTool({
    name: "start_smithers_workflow",
    description:
      "Launch a bounded background Smithers workflow run and return its run id immediately (the run continues detached). Allowed workflows: compare-backends, flue-research.",
    input: v.object({
      workflow: v.pipe(
        v.picklist(Object.keys(WORKFLOW_ALLOWLIST) as [string, ...string[]]),
        v.description("Which allowlisted workflow to run"),
      ),
      prompt: v.pipe(v.string(), v.minLength(1), v.description("The prompt/input for the workflow")),
    }),
    output: v.object({
      runId: v.string(),
      workflow: v.string(),
      startedBy: v.string(),
    }),
    async run({ input }) {
      const file = WORKFLOW_ALLOWLIST[input.workflow]!;
      const runId = `run-${Date.now()}`;
      await new Promise<void>((resolveP, rejectP) => {
        execFile(
          "./node_modules/.bin/smithers",
          ["up", file, "--run-id", runId, "--detach", "--input", JSON.stringify({ prompt: input.prompt })],
          { cwd: SMITHERS_DIR, timeout: 30_000 },
          (err) => (err ? rejectP(err) : resolveP()),
        );
      });
      return { runId, workflow: input.workflow, startedBy: ctx.threadId };
    },
  });
}

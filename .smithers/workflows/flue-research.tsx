// smithers-source: local
// smithers-metadata-version: 1
// smithers-display-name: Flue Research (pattern A)
// smithers-description: Smithers owns the run; the Flue agent app (:3002) is the worker. Research -> human approval -> refine on the same Flue thread.
// smithers-tags: int-27, flue, pattern-a
/** @jsxImportSource smithers-orchestrator */
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";

// Pattern A from the INT-27 test plan: Smithers-owned run, framework-owned
// NOTHING (the ownership rule: durability is never nested — Smithers owns
// this workflow's durability; Flue only owns the durability of each single
// agent turn we ask it for). Each step calls the Flue app's blocking invoke
// (`POST /agents/<name>/<id>?wait=result`) so a step == one settled turn.

const FLUE = process.env.FLUE_BASE_URL ?? "http://localhost:3002";
const AGENT = "research-publisher";

const researchSchema = z.object({
  threadId: z.string(),
  answer: z.string(),
});
const approvalSchema = z.object({
  approved: z.boolean(),
  note: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
const refineSchema = z.object({ clientSummary: z.string() });
const outputSchema = z.looseObject({
  threadId: z.string().default(""),
  approved: z.boolean().default(false),
  clientSummary: z.string().default(""),
});
const inputSchema = z.object({
  prompt: z.string().default("How does durable execution survive a restart?"),
});

async function askFlue(threadId: string, message: string): Promise<string> {
  const res = await fetch(
    `${FLUE}/agents/${AGENT}/${encodeURIComponent(threadId)}?wait=result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) throw new Error(`flue ${res.status}: ${await res.text()}`);
  const body: any = await res.json();
  // The settled result carries the assistant's final message.
  return (
    body?.result?.text ??
    body?.result?.message ??
    body?.text ??
    JSON.stringify(body).slice(0, 2000)
  );
}

const { Workflow, Task, Sequence, Approval, smithers, outputs } = createSmithers({
  input: inputSchema,
  research: researchSchema,
  approval: approvalSchema,
  refine: refineSchema,
  output: outputSchema,
});

export default smithers((ctx) => {
  const research = ctx.outputs.research?.at(-1);
  const approval = ctx.outputs.approval?.at(-1);
  const refine = ctx.outputs.refine?.at(-1);
  return (
    <Workflow name="flue-research">
      <Sequence>
        {/* 1 — durable step: one settled Flue turn. If Smithers crashes AFTER
            this completes, the result is persisted and never re-run. */}
        <Task id="research" output={outputs.research}>
          {async () => {
            const threadId = `smithers_${ctx.runId ?? "run"}`;
            const answer = await askFlue(
              threadId,
              `${ctx.input?.prompt ?? "How does durable execution survive a restart?"} (Answer in 2-3 sentences from a single corpus search. No subagents, no proposal.)`,
            );
            return { threadId, answer };
          }}
        </Task>

        {/* 2 — durable suspension: the run becomes a row in SQLite, not a
            process. Clear it with: smithers approve <run-id> --node approve-research */}
        {research ? (
          <Approval
            id="approve-research"
            output={outputs.approval}
            request={{
              title: "Approve research before client summary",
              summary: research.answer.slice(0, 800),
            }}
          />
        ) : null}

        {/* 3 — same Flue THREAD, next turn: Flue keeps the conversation
            durable; Smithers keeps the pipeline durable. */}
        {approval?.approved && research ? (
          <Task id="refine" output={outputs.refine}>
            {async () => ({
              clientSummary: await askFlue(
                research.threadId,
                "Rewrite your answer as one plain-English sentence suitable for a wealth-management client email.",
              ),
            })}
          </Task>
        ) : null}

        {refine || (approval && !approval.approved) ? (
          <Task id="output" output={outputs.output}>
            {() => ({
              threadId: research?.threadId ?? "",
              approved: approval?.approved ?? false,
              clientSummary: refine?.clientSummary ?? "",
            })}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});

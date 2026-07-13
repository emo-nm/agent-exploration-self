// smithers-source: local
// smithers-metadata-version: 1
// smithers-display-name: Compare Backends (pattern A)
// smithers-description: Fan the same prompt out to Flue (:3002) and Mastra (:3003) in parallel; a blinded step scores both answers. Plan item 10.
// smithers-tags: int-27, comparison, pattern-a
/** @jsxImportSource smithers-orchestrator */
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";

// Plan item 10: turn A/B comparison into a durable, repeatable pipeline.
// Smithers owns the run; each framework only owns its single turn. The two
// worker calls run in PARALLEL and each is independently durable — if mastra
// dies mid-run, flue's finished answer persists and only mastra re-runs.

const FLUE = process.env.FLUE_BASE_URL ?? "http://localhost:3002";
const MASTRA = process.env.MASTRA_BASE_URL ?? "http://localhost:3003";

const answerSchema = z.object({
  backend: z.string(),
  answer: z.string(),
  ms: z.number(),
});
const verdictSchema = z.object({
  winner: z.string(),
  reason: z.string(),
  a: z.object({ backend: z.string(), chars: z.number(), citesCorpus: z.boolean() }),
  b: z.object({ backend: z.string(), chars: z.number(), citesCorpus: z.boolean() }),
});
const inputSchema = z.object({
  prompt: z.string().default("Why must publish side effects be idempotent?"),
});

const SUFFIX = " (Answer in 2-3 sentences from a single corpus search. No subagents, no proposal.)";

async function askFlue(prompt: string, tag: string): Promise<string> {
  const res = await fetch(
    `${FLUE}/agents/research-publisher/${encodeURIComponent(`cmp_${tag}`)}?wait=result`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: prompt + SUFFIX }) },
  );
  if (!res.ok) throw new Error(`flue ${res.status}`);
  const body: any = await res.json();
  return body?.result?.text ?? body?.result?.message ?? JSON.stringify(body).slice(0, 1500);
}

async function askMastra(prompt: string, tag: string): Promise<string> {
  const threadId = `cmp_${tag}`;
  await fetch(`${MASTRA}/api/memory/threads?agentId=research-publisher`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ resourceId: `res_${threadId}`, threadId }),
  });
  const res = await fetch(`${MASTRA}/api/agents/research-publisher/stream`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt + SUFFIX }],
      memory: { thread: threadId, resource: `res_${threadId}` },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`mastra ${res.status}`);
  // Collect text-delta chunks from the stream into the final answer.
  const text = await res.text();
  let answer = "";
  for (const line of text.split("\n")) {
    const t = line.trim().replace(/^data:\s*/, "");
    if (!t) continue;
    try {
      const c = JSON.parse(t);
      const delta = c?.payload?.text ?? (c?.type === "text-delta" ? c?.payload?.delta ?? c?.delta : "");
      if (typeof delta === "string") answer += delta;
    } catch { /* non-json line */ }
  }
  return answer || text.slice(0, 1500);
}

const { Workflow, Task, Sequence, Parallel, smithers, outputs } = createSmithers({
  input: inputSchema,
  answer: answerSchema,
  verdict: verdictSchema,
});

export default smithers((ctx) => {
  const answers = ctx.outputs.answer ?? [];
  const flue = answers.filter((a) => a.backend === "flue").at(-1);
  const mastra = answers.filter((a) => a.backend === "mastra").at(-1);
  const prompt = ctx.input?.prompt ?? "Why must publish side effects be idempotent?";
  const tag = ctx.runId ?? "run";
  return (
    <Workflow name="compare-backends">
      <Sequence>
        <Parallel>
          <Task id="ask-flue" output={outputs.answer}>
            {async () => {
              const t0 = Date.now();
              const answer = await askFlue(prompt, tag);
              return { backend: "flue", answer, ms: Date.now() - t0 };
            }}
          </Task>
          <Task id="ask-mastra" output={outputs.answer}>
            {async () => {
              const t0 = Date.now();
              const answer = await askMastra(prompt, tag);
              return { backend: "mastra", answer, ms: Date.now() - t0 };
            }}
          </Task>
        </Parallel>
        {flue && mastra ? (
          <Task id="judge" output={outputs.verdict}>
            {() => {
              // Blinded, deterministic scoring: the judge sees answers as A/B
              // (order randomized by runId hash), scores corpus grounding and
              // concision. Swap for an llmJudge scorer when we want taste.
              const flip = (tag.charCodeAt(tag.length - 1) ?? 0) % 2 === 0;
              const [A, B] = flip ? [flue, mastra] : [mastra, flue];
              const grade = (x: typeof A) => ({
                backend: x.backend,
                chars: x.answer.length,
                citesCorpus: /doc-\d|corpus|idempot/i.test(x.answer),
              });
              const a = grade(A), b = grade(B);
              const score = (g: typeof a, ms: number) => (g.citesCorpus ? 2 : 0) + (g.chars < 800 ? 1 : 0) + (ms < 15000 ? 1 : 0);
              const sa = score(a, A.ms), sb = score(b, B.ms);
              const winner = sa === sb ? "tie" : sa > sb ? a.backend : b.backend;
              return { winner, reason: `A(${a.backend})=${sa} vs B(${b.backend})=${sb} on grounding/concision/latency`, a, b };
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});

// smithers-source: local
// smithers-metadata-version: 1
// smithers-display-name: Compare Backends (pattern A)
// smithers-description: Fan the same prompt out to Eve (:3001), Flue (:3002) and Mastra (:3003) in parallel; a blinded 3-way step scores all answers and persists the verdict. Plan item 10.
// smithers-tags: int-27, comparison, pattern-a
/** @jsxImportSource smithers-orchestrator */
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";
import { SQL } from "bun";

// Plan item 10: turn the A/B/C comparison into a durable, repeatable pipeline.
// Smithers owns the run; each framework only owns its single turn. The three
// worker calls run in PARALLEL and each is independently durable — if mastra
// dies mid-run, eve's and flue's finished answers persist and only mastra
// re-runs. A trailing compute step writes one verdict row into the MAIN
// agent_eval Postgres (comparison_runs), so the comparison is an auditable
// pipeline, not a throwaway console log.

const EVE = process.env.EVE_BASE_URL ?? "http://localhost:3001";
const FLUE = process.env.FLUE_BASE_URL ?? "http://localhost:3002";
const MASTRA = process.env.MASTRA_BASE_URL ?? "http://localhost:3003";

const answerSchema = z.object({
  backend: z.string(),
  answer: z.string(),
  ms: z.number(),
});
const gradeSchema = z.object({
  label: z.string(),
  backend: z.string(),
  chars: z.number(),
  citesCorpus: z.boolean(),
  ms: z.number(),
  score: z.number(),
});
const verdictSchema = z.object({
  winner: z.string(),
  reason: z.string(),
  // Blinded presentation order (A/B/C -> backend), randomized by runId hash.
  blindOrder: z.array(z.string()),
  grades: z.array(gradeSchema),
});
const persistSchema = z.object({
  rowId: z.string(),
  winner: z.string(),
});
const inputSchema = z.object({
  prompt: z.string().default("Why must publish side effects be idempotent?"),
});

const SUFFIX = " (Answer in 2-3 sentences from a single corpus search. No subagents, no proposal.)";

// Eve's HTTP shape (verified live): POST /eve/v1/session starts a durable
// session and returns { sessionId }; GET /eve/v1/session/<id>/stream is an
// NDJSON event stream. The settled reply is the `message.completed` event
// whose finishReason is "stop", carrying the final text in `data.message`.
// (Interim message.completed events fire before tool calls; we keep the last
// stop one.) We collect the stream to completion — break on the turn/session
// terminal events so we don't hang on the still-open durable stream.
async function askEve(prompt: string, tag: string): Promise<string> {
  const start = await fetch(`${EVE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: prompt + SUFFIX }),
  });
  if (!start.ok) throw new Error(`eve ${start.status}: ${await start.text()}`);
  const started: any = await start.json();
  const sessionId: string =
    started?.sessionId ?? start.headers.get("x-eve-session-id") ?? "";
  if (!sessionId) throw new Error(`eve: no sessionId (tag ${tag})`);

  const stream = await fetch(
    `${EVE}/eve/v1/session/${encodeURIComponent(sessionId)}/stream`,
    { headers: { accept: "application/x-ndjson" } },
  );
  if (!stream.ok || !stream.body) throw new Error(`eve stream ${stream.status}`);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalText = "";
  let done = false;
  const handle = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let ev: any;
    try {
      ev = JSON.parse(t);
    } catch {
      return;
    }
    if (ev?.type === "message.completed" && ev?.data?.finishReason === "stop") {
      if (typeof ev.data.message === "string") finalText = ev.data.message;
    }
    if (
      ev?.type === "turn.completed" ||
      ev?.type === "session.waiting" ||
      ev?.type === "session.completed"
    ) {
      done = true;
    }
    if (ev?.type === "turn.failed" || ev?.type === "session.failed") {
      throw new Error(`eve turn failed: ${JSON.stringify(ev?.data ?? {}).slice(0, 300)}`);
    }
  };
  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handle(line);
        if (done) break;
      }
    }
    if (buf) handle(buf);
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* stream already closed */
    }
  }
  return finalText || "(eve: no settled message)";
}

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
  persist: persistSchema,
});

// Deterministic blinding: derive a stable permutation of the three answers
// from the runId hash, so the judge never sees them in a fixed backend order.
function blindOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const arr = items.slice();
  // Fisher-Yates driven by a small LCG seeded from the hash (deterministic).
  let state = h >>> 0;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default smithers((ctx) => {
  const answers = ctx.outputs.answer ?? [];
  const eve = answers.filter((a) => a.backend === "eve").at(-1);
  const flue = answers.filter((a) => a.backend === "flue").at(-1);
  const mastra = answers.filter((a) => a.backend === "mastra").at(-1);
  const verdict = ctx.outputs.verdict?.at(-1);
  const prompt = ctx.input?.prompt ?? "Why must publish side effects be idempotent?";
  const tag = ctx.runId ?? "run";
  const haveAll = eve && flue && mastra;
  return (
    <Workflow name="compare-backends">
      <Sequence>
        <Parallel>
          <Task id="ask-eve" output={outputs.answer}>
            {async () => {
              const t0 = Date.now();
              const answer = await askEve(prompt, tag);
              return { backend: "eve", answer, ms: Date.now() - t0 };
            }}
          </Task>
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
        {haveAll ? (
          <Task id="judge" output={outputs.verdict}>
            {() => {
              // Blinded, deterministic 3-way scoring: the judge sees the three
              // answers as A/B/C, order randomized by runId hash, and scores
              // corpus grounding / concision / latency. Swap for an llmJudge
              // scorer when we want taste rather than a mechanical rubric.
              const ordered = blindOrder([eve!, flue!, mastra!], tag);
              const labels = ["A", "B", "C"];
              const grades = ordered.map((x, i) => {
                const citesCorpus = /doc-\d|corpus|idempot/i.test(x.answer);
                const chars = x.answer.length;
                const score =
                  (citesCorpus ? 2 : 0) + (chars < 800 ? 1 : 0) + (x.ms < 20000 ? 1 : 0);
                return { label: labels[i], backend: x.backend, chars, citesCorpus, ms: x.ms, score };
              });
              const top = Math.max(...grades.map((g) => g.score));
              const leaders = grades.filter((g) => g.score === top);
              const winner = leaders.length === 1 ? leaders[0].backend : "tie";
              const reason = grades
                .map((g) => `${g.label}(${g.backend})=${g.score}`)
                .join(" vs ") + " on grounding/concision/latency";
              return { winner, reason, blindOrder: ordered.map((x) => x.backend), grades };
            }}
          </Task>
        ) : null}
        {haveAll && verdict ? (
          <Task id="persist" output={outputs.persist}>
            {async () => {
              // Write ONE verdict row to the main agent_eval DB. DATABASE_URL
              // comes from the repo .env (the main DB, not a per-backend one).
              const dbUrl = process.env.DATABASE_URL;
              if (!dbUrl) throw new Error("DATABASE_URL not set");
              const sql = new SQL(dbUrl);
              const id = `cmp_${tag}`;
              const metrics = {
                verdict,
                answers: { eve, flue, mastra },
                judgedAt: new Date().toISOString(),
              };
              try {
                await sql`
                  insert into comparison_runs
                    (id, prompt, eve_thread_id, flue_thread_id, smithers_run_id, metrics_json)
                  values
                    (${id}, ${prompt}, ${`eve_${tag}`}, ${`cmp_${tag}`}, ${tag}, ${metrics})
                  on conflict (id) do update set
                    prompt = excluded.prompt,
                    metrics_json = excluded.metrics_json,
                    smithers_run_id = excluded.smithers_run_id
                `;
              } finally {
                await sql.end();
              }
              return { rowId: id, winner: verdict.winner };
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});

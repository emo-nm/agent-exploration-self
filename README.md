# Agent framework bake-off (INT-27)

We need to pick a framework for building long-lived product agents. Instead
of choosing from docs and blog posts, this repo builds the **same agent three
times** — once in **Eve** (Vercel's framework), once in **Flue**, once in
**Mastra** — and runs the same tests against all three. The winner is decided
by what we observed, not what anyone claims. The output is a decision memo;
the code is disposable.

(**Smithers** also appears, but it is not a contestant — it's a workflow
orchestrator we'll test *around* the winner: can it drive these frameworks as
workers, and can an agent kick off a bounded Smithers job. That part hasn't
started yet.)

Current status lives in [`docs/STATE.md`](docs/STATE.md) (always read that
first). The step-by-step roadmap and why each step exists:
[`docs/plan.md`](docs/plan.md).

## The trick that makes the comparison fair

Everything that is NOT the framework is written once and shared:

- **The agent's "brain"** — identical instructions and skill text
  (`packages/prompts`), identical model (one provider, one model id, set in
  `.env`), for all three.
- **The agent's tools** — each framework gets the same four tools (search,
  create-proposal, check-status, publish). Inside each framework they are
  ~20-line wrappers that validate input (`packages/contracts`) and call the
  same shared functions (`packages/domain`, `packages/effects`).
- **The database** — one Postgres schema (`packages/persistence`) holds
  threads, approvals, and publish records for all three.

So when the three agents behave differently, the difference is the
framework's fault — there is nothing else it could be. It also measures
lock-in directly: the shared code is what would survive switching frameworks.

## The demo agent (what each framework has to implement)

A "research and publish" agent. You ask it to research a topic; it makes a
plan, hands one subtask to a subagent, searches a **fixed fake document
corpus** (not the live web — so every run sees identical data and runs are
comparable), writes a draft, and then **stops and asks a human for
approval**. Once a human approves, it publishes and reports a receipt.

Two boobytraps are built in on purpose, because they simulate production:

1. **The publish step is deliberately flaky.** An env var makes the first 2
   publish attempts fail. The publish is also *idempotent*: every attempt
   carries a key, and the database refuses to create two records for the same
   key. The test at the bottom of everything is: no matter how many retries,
   crashes, or duplicate clicks happen, **exactly one publication exists**.
   Every framework has passed this in every scenario so far.
2. **We kill the process on purpose.** A "terminator" sends SIGKILL (a hard
   crash — no cleanup allowed) at nasty moments, restarts the service, and
   checks whether the conversation survives.

## What we test (the durability matrix)

`pnpm eval:durability --backend eve|flue|mastra` runs 8 scenarios per
framework, each answering a plain question:

| # | scenario | the question |
|---|---|---|
| 1 | kill during model work | crash while the agent is mid-thought — can the thread recover? |
| 2 | kill after a tool ran | did we lose or double the tool's work? |
| 3 | restart while approval pending | is the approval still actionable after a reboot? |
| 4 | resume a saved thread | can a conversation continue later, like a real user would? |
| 5 | drop and reattach the stream | does a flaky network connection break anything? |
| 6 | send the same user input twice | double-click protection |
| 7 | approve twice | double-approval protection |
| 8 | request publish twice | the exactly-once guarantee, tested directly |

Results land in `.eval-results/` as JSON (timings, attempt counts) — that
feeds the memo's numbers. Current standings and diagnosed root causes:
[`docs/log/2026-07-12-durability-matrix-results.md`](docs/log/2026-07-12-durability-matrix-results.md)
— short version: Mastra 8/8 twice; Eve and Flue each fail scenario 1 today
(Eve for a diagnosed reason: a hard crash mid-turn leaves its local queue
retrying dead work forever, which drags down every restart after).

## The other things we probe

- **Approval flow** — the "human says yes" step is owned by our app (a
  database row flips from pending to approved), the same for all three, so
  we compare agents, not approval UIs. Each framework's *native* approval
  primitive is noted separately as a finding.
- **Cost mechanics** — all three route through the same OpenRouter key. We
  discovered Eve and Mastra silently do NO prompt caching off their home
  platforms (every step re-pays the full conversation); we fixed it with a
  shared wrapper (`packages/model`) and `pnpm check:caching` proves caching
  works before we trust any cost numbers.
- **Sandboxing** — where does risky tool execution run? Eve isolates by
  default in production (a real microVM); Flue and Mastra run on the host
  unless you bring your own isolation. See
  `docs/log/2026-07-12-sandbox-research.md`.
- **Skills, auth, licenses, streaming shapes** — recorded per framework in
  `docs/log/2026-07-11-*-baseline-notes.md` and synthesized in
  `docs/log/2026-07-12-learnings-so-far.md`.

## Seeing it with your own eyes

```bash
fnm use 24 && pnpm install
brew services start postgresql@17        # local db (already set up)
# .env needs: DATABASE_URL, OPENROUTER_API_KEY, DEMO_MODEL_ID
pnpm dev                                 # web :3000, eve :3001, flue :3002, mastra :3003
```

Open http://localhost:3000 — pick a backend, start a thread, watch the
transcript / tool calls / subagent activity stream live, approve the proposal
when the card appears, and inspect any event's raw framework-native payload
(we never hide what the framework actually emitted).

## Layout

```text
apps/      web (comparison UI) · eve · flue · mastra · smithers (placeholder)
packages/  contracts · domain · effects · persistence · prompts · model
           evals (durability harness) · {eve,flue,mastra}-adapter · smithers-adapters
docs/      STATE.md (start here) · plan.md · architecture.md · test-plan.md
           deployment.md · findings.md · log/ (dated evidence & notes)
```

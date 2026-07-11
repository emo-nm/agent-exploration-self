# Start here: docs/STATE.md

Before any work, read [`docs/STATE.md`](docs/STATE.md) — what's being
evaluated, the criteria, and the verdict-so-far per candidate. If your session
changes a verdict or the code, update it in the same commit. Dated session
artifacts (findings snapshots, handoffs, status notes) go in
`docs/log/YYYY-MM-DD-<name>.md`, never the repo root. The full build
plan is [`docs/eve-flue-smithers-codex-handoff.md`](docs/eve-flue-smithers-codex-handoff.md);
STATE is the map over it, not a replacement for reading it.

# What this repo is

Spike repo for the INT-27 framework decision: **Eve vs Flue vs Mastra** as
durable product-agent frameworks, plus both **Smithers** integration patterns
(Smithers-owned run vs framework-owned session — never nested; handoff section 4).
pnpm + turbo monorepo: `apps/{eve,flue,mastra,smithers,web}` (Mastra joined
the plan 07-10, after the handoff was written; scaffolded 07-11), shared
code in `packages/`, deployed to Vercel.

Rules of the spike:

- **Use each framework's stock scaffold and defaults.** Fighting the framework
  is signal — note it in STATE/findings, don't silently work around it.
- **Same demo agent in each** (handoff section 8) so the comparison is fair.
- **Direct Eve and direct Flue must pass the baseline tests before any
  Smithers integration work starts** (test-plan).
- **Verdicts only from things run first-hand here.** Docs claims are [doc],
  not [live].
- Code quality doesn't matter; the findings and decision memo do. Don't
  polish throwaway code.
- Tooling: pnpm (lockfile is `pnpm-lock.yaml`) — match the repo, not personal
  defaults.

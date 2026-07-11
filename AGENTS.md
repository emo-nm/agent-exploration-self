# Start here: docs/STATE.md

Before any work, read [`docs/STATE.md`](docs/STATE.md) — what's being
evaluated, the criteria, and the verdict-so-far per candidate. If your session
changes a verdict or the code, update it in the same commit. Dated session
artifacts (findings snapshots, handoffs, status notes) go in
`docs/log/YYYY-MM-DD-<name>.md`, never the repo root. The living plan is
[`docs/plan.md`](docs/plan.md) (roadmap) plus `docs/architecture.md` /
`docs/test-plan.md` / `docs/deployment.md` (spec, promoted per phase from the
historical handoff in `docs/log/`). STATE is the map over all of it.

# What this repo is

Evaluation repo for the INT-27 framework decision: **Eve vs Flue vs Mastra** as
durable product-agent frameworks, plus both **Smithers** integration patterns
(Smithers-owned run vs framework-owned session — never nested; handoff section 4).
pnpm + turbo monorepo: `apps/{eve,flue,mastra,smithers,web}` (Mastra joined
the plan 07-10, after the handoff was written; scaffolded 07-11), shared
code in `packages/`, deployed to Vercel.

Rules of this evaluation:

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


Do not use jargon. Do not use obscure Agile jargon. "Ticket" is fine; don't say "Spike" - no one knows what that is. Talk like a person. 

Don't use non-ascii characters unless appropriate and necessary; don't use §.
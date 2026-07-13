#!/usr/bin/env bash
# Run the full durability suite for all three backends IN PARALLEL.
# Each backend gets its own Postgres database (agent_eval_<backend>) so the
# harness reset/truncate phases can't clobber each other; servers already
# listen on distinct ports and use distinct local stores.
# Prereq: createdb agent_eval_{eve,flue,mastra} + drizzle-kit migrate into each
# (done once; see docs/deployment.md local-dev section).
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

pids=()
for b in eve flue mastra; do
  (
    DATABASE_URL="postgresql://localhost:5432/agent_eval_${b}" \
      pnpm --filter @demo/evals durability -- --backend "$b" "$@" \
      > ".eval-results/parallel-${b}.out" 2>&1
    echo "=== ${b} exited $? ==="
  ) &
  pids+=($!)
done
wait "${pids[@]}"
echo
for b in eve flue mastra; do
  echo "--- ${b} ---"
  tail -12 ".eval-results/parallel-${b}.out"
done

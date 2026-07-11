# Test plan (living spec)

Promoted from the historical handoff (sections 18-19) and extended to Mastra.
This doc wins on conflict. Automate everything below per candidate (Eve,
Flue, Mastra) — identical prompts, fixtures, model settings, tools, skill
content, one delegated subtask, same structured artifact.

**GATE:** no Smithers integration work until direct Eve and direct Flue pass
the durability suite. (Mastra should pass too, but the gate as originally
specced binds on Eve+Flue.)

## Failure injection (instruments)

Environment-controlled, deterministic:

- `DEMO_FAIL_PUBLISH_ATTEMPTS=N` — publish fails first N attempts
- `DEMO_CRASH_AFTER_EFFECT=true` — process exits right after effect commits
- `DEMO_AGENT_TIMEOUT_MS` — forced agent timeout
- `DEMO_FORCE_SUBAGENT_FAILURE=true` — subagent task fails

`publishArtifact` increments attempt_count, fails per config, inserts or
retrieves by unique idempotency key, returns the identical receipt on
duplicates. A dev-only endpoint/script terminates each runtime at defined
checkpoints.

## Durability suite (the verdict-generator, per candidate)

1. terminate during model work → restart → session recovers
2. terminate after tool success, before next model step → no lost/duplicate
   tool effect
3. restart while approval is pending → approval still actionable
4. resume a saved conversation (days-old thread)
5. disconnect and reconnect the event stream
6. duplicate user input submission
7. duplicate approval submission
8. duplicate publication request → exactly-once publish (same receipt)

Pass/fail line: the publication side effect occurs exactly once in every
scenario.

## Security and boundaries

- user A cannot resume user B's thread
- tool cannot publish an unapproved proposal
- tool cannot change publication destination
- agent never sees raw provider or Smithers credentials
- arbitrary Smithers workflow paths rejected (fixed allowlist only)
- sandbox cannot access unrelated host files

## Smithers integration (phase 3, after the gate)

- Smithers invokes Eve as a worker; invokes Flue as a worker; both in
  parallel; one backend failure does not corrupt the other task
- Eve launches a Smithers child run; Flue launches a Smithers child run
- Smithers approval completed from the web UI
- parent session retrieves final child output

## Adapter tests (packages/smithers-adapters)

successful generation; unavailable backend fails preflight; cancellation;
timeout; session isolation; stable-session continuation; malformed response
handling; no credential leakage; output-schema fallback.

## Scoring discipline

Run the deterministic eval suite multiple times; separate framework behavior
from model variance; never claim a winner from one run's elapsed time; never
weaken a failing parity test to make it pass.

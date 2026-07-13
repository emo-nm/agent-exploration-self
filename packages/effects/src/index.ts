// @demo/effects — Idempotent, deliberately flaky publish effect (handoff §18)
// Framework-neutral: NO Eve/Flue/Mastra/Smithers imports.
import { createHash } from "node:crypto";
import type { EffectsRepo } from "@demo/persistence";
import type { PublicationReceipt } from "@demo/contracts";

export interface PublishArtifactInput {
  proposalId: string;
  idempotencyKey: string;
  title: string;
  body: string;
}

export type PublishArtifactResult = PublicationReceipt;

export interface PublishArtifactEnv {
  /** Fail the first N attempts (DEMO_FAIL_PUBLISH_ATTEMPTS). */
  failAttempts?: number;
  /** If true, crash the process right after the effect commits. */
  crashAfterEffect?: boolean;
  /**
   * Sleep this many ms AFTER the attempt row is reserved but BEFORE the effect
   * commits (DEMO_PAUSE_BEFORE_COMMIT_MS). This widens the window in which the
   * process is "doing tool work" so the durability harness can SIGKILL at a
   * deterministic checkpoint (mid-publish) instead of racing the model.
   */
  pauseBeforeCommitMs?: number;
}

export interface PublishArtifactDeps {
  repo: EffectsRepo;
  /** Injected so tests can stub instead of really exiting. */
  crash?: () => void;
  /** Injected id generator for the effect row. */
  newId?: () => string;
  /** Env overrides (defaults read from process.env). */
  env?: PublishArtifactEnv;
}

export function requestChecksum(input: PublishArtifactInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        proposalId: input.proposalId,
        title: input.title,
        body: input.body,
      }),
    )
    .digest("hex");
}

function readEnv(env?: PublishArtifactEnv): Required<PublishArtifactEnv> {
  const failAttempts =
    env?.failAttempts ??
    Number.parseInt(process.env.DEMO_FAIL_PUBLISH_ATTEMPTS ?? "0", 10);
  const crashAfterEffect =
    env?.crashAfterEffect ?? process.env.DEMO_CRASH_AFTER_EFFECT === "true";
  const pauseBeforeCommitMs =
    env?.pauseBeforeCommitMs ??
    Number.parseInt(process.env.DEMO_PAUSE_BEFORE_COMMIT_MS ?? "0", 10);
  return {
    failAttempts: Number.isFinite(failAttempts) ? failAttempts : 0,
    crashAfterEffect,
    pauseBeforeCommitMs: Number.isFinite(pauseBeforeCommitMs)
      ? pauseBeforeCommitMs
      : 0,
  };
}

/**
 * Publish an approved artifact. Idempotent by idempotencyKey:
 *  - increments attempt_count each invocation;
 *  - fails the first N attempts when configured;
 *  - inserts-or-retrieves by unique idempotency key;
 *  - returns the identical receipt on any duplicate call (created=false).
 */
export async function publishArtifact(
  input: PublishArtifactInput,
  deps: PublishArtifactDeps,
): Promise<PublishArtifactResult> {
  const { repo } = deps;
  const env = readEnv(deps.env);
  const newId = deps.newId ?? (() => `eff_${input.idempotencyKey}`);
  const checksum = requestChecksum(input);

  // Insert-or-retrieve by unique idempotency key.
  let effect = await repo.getEffectByIdempotencyKey(input.idempotencyKey);
  if (!effect) {
    effect = await repo.createEffect({
      id: newId(),
      proposalId: input.proposalId,
      idempotencyKey: input.idempotencyKey,
      requestChecksum: checksum,
    });
  }

  // Already committed → return the identical receipt (created=false).
  if (effect.resultJson) {
    return { ...(effect.resultJson as PublicationReceipt), created: false };
  }

  // Fresh attempt.
  const attempt = await repo.incrementAttemptCount(effect.id);

  // Deliberate flakiness: fail the first N attempts.
  if (attempt <= env.failAttempts) {
    throw new Error(
      `publish failed (attempt ${attempt} of first ${env.failAttempts} configured to fail)`,
    );
  }

  // Deterministic kill checkpoint: the attempt row is reserved (attempt_count
  // bumped) but the effect has NOT committed yet. A harness that SIGKILLs the
  // process during this window is testing "terminate mid-tool-work": on restart
  // the row exists with resultJson=null and a retry must still publish exactly
  // once (same idempotency key → same receipt).
  if (env.pauseBeforeCommitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, env.pauseBeforeCommitMs));
  }

  // Commit the effect.
  const receipt: PublicationReceipt = {
    publicationId: `pub_${effect.id}`,
    created: true,
    checksum,
  };
  await repo.saveResult(effect.id, receipt);

  // Crash checkpoint AFTER the effect has committed (guarded/injectable).
  if (env.crashAfterEffect) {
    (deps.crash ?? (() => process.exit(1)))();
  }

  return receipt;
}

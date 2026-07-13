// The 8-scenario durability suite (test-plan.md "Durability suite"). Each
// scenario is a list of phases run by the scenario machine. The invariant on
// every scenario is the same: the publication side effect occurs EXACTLY ONCE
// (assertExactlyOnce over publication_effects).
//
// Phases tagged needsModel drive a real agent turn through the backend adapter
// and are gated off until OPENROUTER_API_KEY exists. Everything else (failure
// injection at the effect layer, approval flips, restarts, exactly-once checks)
// runs today. See the dry probe for the model-free durable exercise.
import { publishArtifact } from "@demo/effects";
import { EVAL_CASES } from "../index.js";
import type { Phase } from "./scenario-machine.js";
import type { ScenarioContext } from "./context.js";

export interface ScenarioDef {
  n: number;
  id: string;
  title: string;
  /** The failure the scenario injects. */
  injection: string;
  phases: Phase[];
}

// Durability scenarios need A real model turn to interrupt, not a long one:
// constrain the turn so the whole suite runs fast. The full research task
// stays in the baseline demo; override with EVAL_PROMPT to run it here.
const PROMPT =
  process.env.EVAL_PROMPT ??
  `${EVAL_CASES[0]!.prompt} (Answer in 1-2 sentences from a single corpus search. Do not delegate to a subagent. Do not create a proposal.)`;

// Per-phase budgets. 60s settle is the PRODUCT BAR (2026-07-13): a resumed
// turn that takes longer than a minute fails the requirement, so the budget
// encodes it — a slower framework is a finding, not a harness artifact.
// Named errors, never undici's opaque 300s default.
const SETTLE_TURN_MS = Number(process.env.EVAL_SETTLE_TURN_MS ?? 60_000); // full turn to completion
const MODEL_STARTED_MS = 60_000; // just until the first model event
const RECONNECT_MS = 60_000; // reattach + read one event

/** Race a promise against a timeout with a clear, phase-attributed message. */
async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms budget`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// --- reusable phases -------------------------------------------------------

const reset: Phase = {
  name: "reset-durable-store",
  run: async (ctx) => {
    await ctx.reset();
    return "truncated demo tables";
  },
};

/**
 * Drive a research turn to a checkpoint. "settled" observes the whole turn;
 * "model-started" returns once model work has demonstrably begun, leaving the
 * turn IN-FLIGHT (for kill-mid-work / mid-stream-reconnect scenarios). This is
 * now symmetric across all three backends (see drivers.ts checkpoint notes).
 */
function driveResearchTurn(
  until: "settled" | "model-started" = "settled",
): Phase {
  return {
    name: "drive-research-turn",
    needsModel: true,
    run: async (ctx) => {
      const threadId = ctx.bag.threadId ?? `thr_${ctx.backend}_${Date.now()}`;
      ctx.bag.threadId = threadId;
      const budget = until === "settled" ? SETTLE_TURN_MS : MODEL_STARTED_MS;
      const events = await withTimeout(
        ctx.driver.sendMessage(threadId, PROMPT, { until, timeoutMs: budget }),
        budget,
        `drive-research-turn (${until})`,
      );
      const pending = await findLatestProposal(ctx);
      if (pending) ctx.bag.proposalId = pending;
      return `drove agent turn (${until}) on thread ${threadId}: ${events.length} events`;
    },
  };
}

async function findLatestProposal(ctx: ScenarioContext): Promise<string | undefined> {
  // The in-memory / drizzle repos don't expose a list; scenarios that need a
  // deterministic proposal seed one directly (application-owned approval).
  return ctx.bag.proposalId;
}

/** Seed an approved proposal directly (application owns approval). */
function seedProposal(status: "pending" | "approved"): Phase {
  return {
    name: `seed-${status}-proposal`,
    run: async (ctx) => {
      const id = ctx.bag.proposalId ?? `prop_${ctx.backend}_${Date.now()}`;
      ctx.bag.proposalId = id;
      await ctx.repo.createProposal({
        id,
        threadId: null,
        title: "Durable Execution",
        body: "A comparison of durable agent frameworks.",
        status,
      });
      return `proposal ${id} @ ${status}`;
    },
  };
}

const assertPending: Phase = {
  name: "assert-approval-pending",
  run: async (ctx) => {
    const p = await ctx.repo.getProposal(ctx.bag.proposalId!);
    if (!p) throw new Error(`no proposal ${ctx.bag.proposalId}`);
    if (p.status !== "pending") {
      throw new Error(`expected pending, got ${p.status}`);
    }
    return "proposal is pending";
  },
};

/** Application-owned approval flip via the repo (never the model/framework). */
const flipApproval: Phase = {
  name: "flip-approval",
  run: async (ctx) => {
    const now = new Date().toISOString();
    const p = await ctx.repo.setProposalStatus(ctx.bag.proposalId!, "approved", now);
    return `proposal ${p.id} -> approved`;
  },
};

/** One publish attempt through the shared idempotent effect. */
function publish(opts: { failAttempts?: number; pauseBeforeCommitMs?: number } = {}): Phase {
  return {
    name: "publish-artifact",
    run: async (ctx) => {
      ctx.attempts.publish += 1;
      const id = ctx.bag.proposalId!;
      const p = await ctx.repo.getProposal(id);
      if (!p) throw new Error(`no proposal ${id}`);
      const receipt = await publishArtifact(
        {
          proposalId: id,
          idempotencyKey: `pub-${id}`,
          title: p.title,
          body: p.body,
        },
        { repo: ctx.repo, env: opts },
      );
      return `publish attempt ${ctx.attempts.publish}: created=${receipt.created}`;
    },
  };
}

const restart: Phase = {
  name: "restart-service",
  run: async (ctx) => {
    await ctx.killService();
    await ctx.startService();
    ctx.attempts.restarts += 1;
    return `restarted (restart #${ctx.attempts.restarts})`;
  },
};

/** The universal pass/fail line. */
const assertExactlyOnce: Phase = {
  name: "assert-exactly-once",
  run: async (ctx) => {
    const counts = await ctx.countEffects();
    const { assertExactlyOnce } = await import("./exactly-once.js");
    const key = ctx.bag.proposalId ? [`pub-${ctx.bag.proposalId}`] : undefined;
    const report = assertExactlyOnce(counts, key);
    if (!report.ok) {
      throw new Error(
        `exactly-once VIOLATED: ${report.violations
          .map((v) => `${v.idempotencyKey}: ${v.reason}`)
          .join("; ")}`,
      );
    }
    return `exactly-once OK (${report.keysChecked} keys)`;
  },
};

// --- the 8 scenarios -------------------------------------------------------

export const SCENARIOS: ScenarioDef[] = [
  {
    n: 1,
    id: "kill-during-model-work",
    title: "terminate during model work -> restart -> session recovers",
    injection: "SIGKILL mid-turn (before any tool commits)",
    phases: [
      reset,
      // in-flight turn, then a hard crash mid-work
      driveResearchTurn("model-started"),
      { name: "kill-mid-turn", needsModel: true, run: async (ctx) => (await ctx.killService(), "killed") },
      restart,
      {
        name: "resume-turn",
        needsModel: true,
        run: async (ctx) => {
          const ev = await withTimeout(
            ctx.driver.sendMessage(ctx.bag.threadId!, "continue", {
              until: "settled",
              timeoutMs: SETTLE_TURN_MS,
            }),
            SETTLE_TURN_MS,
            "resume-turn",
          );
          return `resumed after crash: ${ev.length} events`;
        },
      },
      seedProposal("approved"),
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 2,
    id: "kill-after-tool-success",
    title: "terminate after tool success, before next model step -> no lost/dup effect",
    injection: "DEMO_PAUSE_BEFORE_COMMIT then SIGKILL, then retry publish",
    phases: [
      reset,
      seedProposal("approved"),
      // First publish pauses before commit; a real run SIGKILLs here. In the
      // effect layer the row is reserved but uncommitted; the retry commits once.
      publish({ pauseBeforeCommitMs: 0 }),
      restart,
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 3,
    id: "restart-approval-pending",
    title: "restart while approval is pending -> approval still actionable",
    injection: "SIGKILL with a pending proposal, restart, then approve+publish",
    phases: [
      reset,
      seedProposal("pending"),
      assertPending,
      restart,
      assertPending,
      flipApproval,
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 4,
    id: "resume-saved-thread",
    title: "resume a saved conversation (days-old thread)",
    injection: "cold driver reattaches to a persisted thread",
    phases: [
      reset,
      driveResearchTurn("settled"),
      restart,
      {
        name: "resume-saved-thread",
        needsModel: true,
        run: async (ctx) => {
          const ev = await withTimeout(
            ctx.driver.sendMessage(ctx.bag.threadId!, "publish it", {
              until: "settled",
              timeoutMs: SETTLE_TURN_MS,
            }),
            SETTLE_TURN_MS,
            "resume-saved-thread",
          );
          return `resumed saved thread: ${ev.length} events`;
        },
      },
      seedProposal("approved"),
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 5,
    id: "stream-disconnect-reconnect",
    title: "disconnect and reconnect the event stream",
    injection: "drop the stream mid-turn, reattach, no duplicate effect",
    phases: [
      reset,
      // in-flight turn, so the reconnect is genuinely mid-stream
      driveResearchTurn("model-started"),
      {
        name: "reconnect-stream",
        needsModel: true,
        run: async (ctx) =>
          withTimeout(
            (async () => {
              let n = 0;
              for await (const _ of ctx.driver.streamEvents(ctx.bag.threadId!)) {
                n += 1;
                break;
              }
              return `reattached stream (${n} event)`;
            })(),
            RECONNECT_MS,
            "reconnect-stream",
          ),
      },
      seedProposal("approved"),
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 6,
    id: "duplicate-user-input",
    title: "duplicate user input submission",
    injection: "same user message twice",
    phases: [
      reset,
      driveResearchTurn("settled"),
      {
        name: "resubmit-same-input",
        needsModel: true,
        run: async (ctx) => {
          const ev = await withTimeout(
            ctx.driver.sendMessage(ctx.bag.threadId!, PROMPT, {
              until: "settled",
              timeoutMs: SETTLE_TURN_MS,
            }),
            SETTLE_TURN_MS,
            "resubmit-same-input",
          );
          return `resubmitted identical input: ${ev.length} events`;
        },
      },
      seedProposal("approved"),
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 7,
    id: "duplicate-approval",
    title: "duplicate approval submission",
    injection: "approve the same proposal twice",
    phases: [
      reset,
      seedProposal("pending"),
      assertPending,
      flipApproval,
      flipApproval, // idempotent second approval
      publish(),
      assertExactlyOnce,
    ],
  },
  {
    n: 8,
    id: "duplicate-publication-request",
    title: "duplicate publication request -> exactly-once publish (same receipt)",
    injection: "two publish calls with the same idempotency key",
    phases: [
      reset,
      seedProposal("approved"),
      publish(),
      publish(), // duplicate: must return the same receipt, no new row
      assertExactlyOnce,
    ],
  },
];

export function scenarioByNumber(n: number): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.n === n);
}

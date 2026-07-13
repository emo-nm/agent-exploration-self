// @demo/evals — Shared test prompts + a scoring stub (handoff #19/#20).
// Minimal on purpose: no harness yet. Framework-neutral.
import type { ResearchResult } from "@demo/contracts";

export interface EvalCase {
    id: string;
    prompt: string;
    /** Corpus docIds we expect to surface for this prompt. */
    expectDocIds: string[];
}

/** Canonical research requests shared across every framework. */
export const EVAL_CASES: EvalCase[] = [
    {
        id: "eval-durable",
        prompt: "How does durable execution survive a restart?",
        expectDocIds: ["doc-1", "doc-10"],
    },
    {
        id: "eval-idempotency",
        prompt: "Why must publish side effects be idempotent?",
        expectDocIds: ["doc-3"],
    },
    {
        id: "eval-approval",
        prompt: "How do human approval steps pause an agent?",
        expectDocIds: ["doc-4"],
    },
    {
        id: "eval-subagents",
        prompt: "What is a subagent and why delegate a subtask?",
        expectDocIds: ["doc-8", "doc-2"],
    },
    {
        id: "eval-typed-tools",
        prompt: "What are typed tool interfaces with zod schemas?",
        expectDocIds: ["doc-6"],
    },
];

export interface EvalScore {
    caseId: string;
    recall: number; // fraction of expected docIds retrieved
    passed: boolean;
}

/**
 * Scoring stub: recall of expected docIds among the retrieved hits.
 * A real harness (fan-out, model runs, latency/cost metrics) comes later.
 */
export function scoreCase(
    evalCase: EvalCase,
    result: ResearchResult,
): EvalScore {
    const got = new Set(result.hits.map((h) => h.docId));
    const found = evalCase.expectDocIds.filter((id) => got.has(id)).length;
    const recall =
        evalCase.expectDocIds.length === 0
            ? 1
            : found / evalCase.expectDocIds.length;
    return { caseId: evalCase.id, recall, passed: recall >= 0.5 };
}

// Deterministic fixture corpus — no network, same input → same output.
// Topics: agent frameworks / durable execution / evaluation.
export interface CorpusDoc {
  id: string;
  title: string;
  text: string;
}

export const FIXTURE_CORPUS: CorpusDoc[] = [
  {
    id: "doc-1",
    title: "What durable execution means",
    text: "Durable execution lets a workflow survive process restarts by persisting each step. State is checkpointed so a crashed run resumes from the last committed step rather than starting over.",
  },
  {
    id: "doc-2",
    title: "Agent frameworks overview",
    text: "An agent framework coordinates a model, tools, and memory. It manages the conversation loop, dispatches tool calls, and can delegate work to subagents for focused subtasks.",
  },
  {
    id: "doc-3",
    title: "Idempotency and side effects",
    text: "External side effects such as publishing must be idempotent. Using a unique idempotency key ensures a retried publish returns the same receipt instead of creating duplicates.",
  },
  {
    id: "doc-4",
    title: "Human approval steps",
    text: "A human approval step pauses the agent on a pending action. The workflow waits until a person approves or denies before the side effect is allowed to run.",
  },
  {
    id: "doc-5",
    title: "Long-lived conversations",
    text: "Long-lived conversations pause and resume across days. The framework persists session state so a user can continue the same thread later without losing context.",
  },
  {
    id: "doc-6",
    title: "Typed tool interfaces",
    text: "Typed tool interfaces validate tool input against a schema before execution. Zod schemas describe the shape of tool arguments and produce inferred TypeScript types.",
  },
  {
    id: "doc-7",
    title: "Evaluation and observability",
    text: "Evaluation harnesses score agent runs against expected outputs. Observability hooks emit events for messages, tool calls, and subagent activity so runs can be traced.",
  },
  {
    id: "doc-8",
    title: "Subagents and delegation",
    text: "Subagents handle a focused subtask on behalf of a parent agent. Delegation keeps the main context small and isolates the researcher's work from the publisher's.",
  },
  {
    id: "doc-9",
    title: "Retries and failure injection",
    text: "Deliberate failure injection tests reliability. Failing the first N publish attempts and crashing after an effect commits verifies that retries and idempotency hold under interruption.",
  },
  {
    id: "doc-10",
    title: "Checkpointing state",
    text: "Checkpointing writes continuation state to storage between steps. On restart the durable workflow reads the checkpoint and continues, so no completed work is repeated.",
  },
];

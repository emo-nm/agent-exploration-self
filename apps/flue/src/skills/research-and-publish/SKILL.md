---
name: research-and-publish
description: Research a topic against a fixture corpus, draft an artifact, and publish it after human approval.
---

# Research and Publish

Use this skill when the user asks you to research a topic and publish a result.

## Steps

1. **Plan** — turn the request into a short research plan.
2. **Delegate** — hand one focused subtask to the researcher subagent.
3. **Search** — call the fixture-corpus search tool. It is deterministic and
   offline; the same query always returns the same hits.
4. **Draft** — compose a titled draft grounded in the retrieved snippets.
5. **Propose** — create a publication proposal (status: pending).
6. **Await approval** — the application approves or denies. Do not publish a
   proposal that is not approved.
7. **Publish** — call the publish tool with a stable idempotency key. Retries
   must reuse the same key and return the same receipt.
8. **Report** — return the final artifact and the publication receipt.

## Rules

- Never bypass the approval gate.
- Never publish an unapproved or already-published proposal without reusing the
  original idempotency key.
- Ground every claim in a corpus document; do not invent sources.

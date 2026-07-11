// @demo/domain — Pure framework-neutral domain functions (handoff §9).
// NO Eve/Flue/Mastra/Smithers imports. All functions take/return contracts types.
import { createHash } from "node:crypto";
import type {
  ResearchRequest,
  ResearchPlan,
  ResearchResult,
  CorpusHit,
  PublicationProposal,
} from "@demo/contracts";
import {
  publishArtifact,
  type PublishArtifactDeps,
  type PublishArtifactResult,
} from "@demo/effects";
import { FIXTURE_CORPUS } from "./corpus.js";

export { FIXTURE_CORPUS } from "./corpus.js";
export type { CorpusDoc } from "./corpus.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "how", "what", "does", "do", "with", "by", "that", "this", "it", "as",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Deterministic keyword-scored search over the fixture corpus. */
export function searchFixtureCorpus(
  query: string,
  maxResults = 5,
): ResearchResult {
  const terms = tokenize(query);
  const hits: CorpusHit[] = FIXTURE_CORPUS.map((doc) => {
    const haystack = tokenize(`${doc.title} ${doc.text}`);
    let score = 0;
    for (const term of terms) {
      for (const w of haystack) if (w === term) score += 1;
    }
    return {
      docId: doc.id,
      title: doc.title,
      snippet: doc.text.slice(0, 140),
      score,
    };
  })
    .filter((h) => h.score > 0)
    // Deterministic tie-break: score desc, then docId asc.
    .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId))
    .slice(0, maxResults);

  return { query, hits };
}

/** Build a short, deterministic research plan from a request. */
export function createResearchPlan(request: ResearchRequest): ResearchPlan {
  const terms = tokenize(request.prompt);
  const primary = request.prompt.trim();
  const secondary = terms.slice(0, 2).join(" ") || primary;
  return {
    prompt: request.prompt,
    steps: [
      {
        id: "step-1",
        description: "Search the corpus for the core topic",
        query: primary,
      },
      {
        id: "step-2",
        description: "Search for supporting detail on key terms",
        query: secondary,
      },
    ],
    rationale:
      "Two focused corpus searches: the full request, then its salient keywords.",
  };
}

/** Compose search results into a structured draft (title + body). */
export function createDraft(
  request: ResearchRequest,
  result: ResearchResult,
): { title: string; body: string } {
  const title = `Research: ${request.prompt.trim()}`;
  const bullets = result.hits
    .map((h) => `- ${h.title}: ${h.snippet}`)
    .join("\n");
  const body =
    result.hits.length === 0
      ? `No corpus documents matched "${request.prompt.trim()}".`
      : `Findings for "${request.prompt.trim()}":\n\n${bullets}`;
  return { title, body };
}

/** Create a pending publication proposal (application-owned approval flow). */
export function createPublicationProposal(args: {
  id: string;
  threadId: string | null;
  title: string;
  body: string;
  now?: () => string;
}): PublicationProposal {
  const now = (args.now ?? (() => new Date().toISOString()))();
  return {
    id: args.id,
    threadId: args.threadId,
    title: args.title,
    body: args.body,
    status: "pending",
    createdAt: now,
    decidedAt: null,
  };
}

/** Apply an approval decision to a pending proposal (pure state transition). */
export function approveProposal(
  proposal: PublicationProposal,
  decision: "approved" | "denied",
  now: () => string = () => new Date().toISOString(),
): PublicationProposal {
  if (proposal.status !== "pending") {
    throw new Error(
      `cannot decide proposal ${proposal.id}: status is ${proposal.status}, expected pending`,
    );
  }
  return { ...proposal, status: decision, decidedAt: now() };
}

export function proposalChecksum(proposal: PublicationProposal): string {
  return createHash("sha256")
    .update(JSON.stringify({ title: proposal.title, body: proposal.body }))
    .digest("hex");
}

/**
 * Thin orchestration over the idempotent publish effect. Requires the proposal
 * to be approved (revalidates status per §17).
 */
export async function publishApprovedProposal(
  proposal: PublicationProposal,
  idempotencyKey: string,
  deps: PublishArtifactDeps,
): Promise<PublishArtifactResult> {
  if (proposal.status !== "approved") {
    throw new Error(
      `cannot publish proposal ${proposal.id}: status is ${proposal.status}, expected approved`,
    );
  }
  return publishArtifact(
    {
      proposalId: proposal.id,
      idempotencyKey,
      title: proposal.title,
      body: proposal.body,
    },
    deps,
  );
}

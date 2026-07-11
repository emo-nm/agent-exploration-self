// @demo/contracts — Shared Zod schemas and inferred types (handoff §9)
// Framework-neutral: NO Eve/Flue/Mastra/Smithers imports.
// zod v4 (repo resolves zod@4.4.3).
import { z } from "zod";

export const BackendSchema = z.enum(["eve", "flue", "mastra"]);
export type Backend = z.infer<typeof BackendSchema>;

// --- research-request ---
export const ResearchRequestSchema = z.object({
  prompt: z.string().min(1),
  requestedBy: z.string().min(1).optional(),
  maxResults: z.number().int().positive().max(50).default(5),
});
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

// --- research-plan ---
export const ResearchPlanStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  query: z.string().min(1),
});
export type ResearchPlanStep = z.infer<typeof ResearchPlanStepSchema>;

export const ResearchPlanSchema = z.object({
  prompt: z.string().min(1),
  steps: z.array(ResearchPlanStepSchema).min(1),
  rationale: z.string(),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

// --- research-result ---
export const CorpusHitSchema = z.object({
  docId: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
});
export type CorpusHit = z.infer<typeof CorpusHitSchema>;

export const ResearchResultSchema = z.object({
  query: z.string().min(1),
  hits: z.array(CorpusHitSchema),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

// --- publication-proposal ---
export const ProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "published",
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const PublicationProposalSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1).nullable(),
  title: z.string().min(1),
  body: z.string().min(1),
  status: ProposalStatusSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type PublicationProposal = z.infer<typeof PublicationProposalSchema>;

// --- publication-receipt ---
export const PublicationReceiptSchema = z.object({
  publicationId: z.string().min(1),
  created: z.boolean(),
  checksum: z.string().min(1),
});
export type PublicationReceipt = z.infer<typeof PublicationReceiptSchema>;

// --- agent-events ---
// Normalized event union across frameworks. Every variant keeps a `raw`
// passthrough so framework-native event payloads are never lost.
const baseEventFields = {
  ts: z.string(),
  raw: z.unknown().optional(),
};

export const AgentMessageEventSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  ...baseEventFields,
});

export const AgentToolCallEventSchema = z.object({
  type: z.literal("tool-call"),
  toolName: z.string(),
  callId: z.string(),
  input: z.unknown(),
  ...baseEventFields,
});

export const AgentToolResultEventSchema = z.object({
  type: z.literal("tool-result"),
  toolName: z.string(),
  callId: z.string(),
  output: z.unknown(),
  ...baseEventFields,
});

export const AgentSubagentEventSchema = z.object({
  type: z.literal("subagent"),
  name: z.string(),
  status: z.enum(["started", "completed", "failed"]),
  detail: z.string().optional(),
  ...baseEventFields,
});

export const AgentApprovalPendingEventSchema = z.object({
  type: z.literal("approval-pending"),
  proposalId: z.string(),
  ...baseEventFields,
});

export const AgentApprovalDecidedEventSchema = z.object({
  type: z.literal("approval-decided"),
  proposalId: z.string(),
  decision: z.enum(["approved", "denied"]),
  ...baseEventFields,
});

export const AgentPublishedEventSchema = z.object({
  type: z.literal("published"),
  proposalId: z.string(),
  receipt: PublicationReceiptSchema,
  ...baseEventFields,
});

export const AgentErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  ...baseEventFields,
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  AgentMessageEventSchema,
  AgentToolCallEventSchema,
  AgentToolResultEventSchema,
  AgentSubagentEventSchema,
  AgentApprovalPendingEventSchema,
  AgentApprovalDecidedEventSchema,
  AgentPublishedEventSchema,
  AgentErrorEventSchema,
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

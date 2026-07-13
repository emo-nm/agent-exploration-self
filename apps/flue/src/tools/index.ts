import type { ToolDefinition } from "@flue/runtime";
import type { ToolFactoryContext } from "./context.ts";
import { searchFixtureCorpusTool } from "./search-fixture-corpus.ts";
import { createPublicationProposalTool } from "./create-publication-proposal.ts";
import { getPublicationStatusTool } from "./get-publication-status.ts";
import { publishArtifactTool } from "./publish-artifact.ts";
import { startSmithersWorkflowTool } from "./start-smithers-workflow.ts";

export type { ToolFactoryContext } from "./context.ts";

/** All research-and-publish tools, bound to one agent instance's context. */
export function buildResearchTools(
  ctx: ToolFactoryContext,
): ToolDefinition[] {
  return [
    searchFixtureCorpusTool(ctx),
    createPublicationProposalTool(ctx),
    getPublicationStatusTool(ctx),
    publishArtifactTool(ctx),
    startSmithersWorkflowTool(ctx),
  ];
}

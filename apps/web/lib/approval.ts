// Pure state machine for the pending-approval card. The card drives the
// application-owned proposals flow (@demo/persistence): load a proposal by id,
// show approve/deny, then reflect the settled row. Kept side-effect-free so it
// is unit-testable; the component wires actions to /api/proposals routes.
import type { PublicationProposal, ProposalStatus } from "@demo/contracts";

export type Decision = "approve" | "deny";

export type ApprovalState =
  | { status: "idle" }
  | { status: "loading"; proposalId: string }
  | { status: "pending"; proposal: PublicationProposal }
  | { status: "deciding"; proposal: PublicationProposal; decision: Decision }
  | { status: "settled"; proposal: PublicationProposal }
  | { status: "error"; proposalId: string | null; message: string };

export type ApprovalAction =
  | { type: "load"; proposalId: string }
  | { type: "loaded"; proposal: PublicationProposal }
  | { type: "decide"; decision: Decision }
  | { type: "settled"; proposal: PublicationProposal }
  | { type: "error"; message: string }
  | { type: "reset" };

export const initialApprovalState: ApprovalState = { status: "idle" };

/** A proposal whose status is out of "pending" is considered settled. */
export function isSettled(status: ProposalStatus): boolean {
  return status !== "pending";
}

export function proposalIdOf(state: ApprovalState): string | null {
  switch (state.status) {
    case "loading":
      return state.proposalId;
    case "pending":
    case "deciding":
    case "settled":
      return state.proposal.id;
    case "error":
      return state.proposalId;
    default:
      return null;
  }
}

/** True only when the card should show enabled approve/deny buttons. */
export function canDecide(state: ApprovalState): boolean {
  return state.status === "pending";
}

export function approvalReducer(
  state: ApprovalState,
  action: ApprovalAction,
): ApprovalState {
  switch (action.type) {
    case "load":
      // Loading the same already-settled proposal is a no-op; otherwise fetch.
      if (state.status === "settled" && state.proposal.id === action.proposalId) {
        return state;
      }
      return { status: "loading", proposalId: action.proposalId };

    case "loaded":
      // A proposal that arrives already-decided goes straight to settled.
      if (isSettled(action.proposal.status)) {
        return { status: "settled", proposal: action.proposal };
      }
      return { status: "pending", proposal: action.proposal };

    case "decide":
      // Guard: can only decide from a pending state (prevents double-submit).
      if (state.status !== "pending") return state;
      return {
        status: "deciding",
        proposal: state.proposal,
        decision: action.decision,
      };

    case "settled":
      return { status: "settled", proposal: action.proposal };

    case "error":
      return {
        status: "error",
        proposalId: proposalIdOf(state),
        message: action.message,
      };

    case "reset":
      return initialApprovalState;

    default:
      return state;
  }
}

/** Map a UI decision to the proposal status the repo should be set to. */
export function decisionToStatus(decision: Decision): ProposalStatus {
  return decision === "approve" ? "approved" : "denied";
}

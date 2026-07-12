"use client";
import { useEffect, useReducer } from "react";
import {
  approvalReducer,
  canDecide,
  initialApprovalState,
  type Decision,
} from "../../lib/approval";
import type { PublicationProposal } from "@demo/contracts";

// Pending-approval card. Watches for a proposalId (from the event stream, or a
// manually created demo proposal), loads the row, and drives approve/deny
// against /api/proposals/:id (the application-owned proposals flow).
export function ApprovalCard({
  proposalId,
  onSettled,
}: {
  proposalId: string | null;
  onSettled?: (proposal: PublicationProposal) => void;
}) {
  const [state, dispatch] = useReducer(approvalReducer, initialApprovalState);

  useEffect(() => {
    if (!proposalId) return;
    dispatch({ type: "load", proposalId });
    let cancelled = false;
    fetch(`/api/proposals/${encodeURIComponent(proposalId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`load failed: HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) dispatch({ type: "loaded", proposal: data.proposal });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "error", message: String(err.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  async function decide(decision: Decision) {
    dispatch({ type: "decide", decision });
    try {
      const res = await fetch(`/api/proposals/${encodeURIComponent(proposalId!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      dispatch({ type: "settled", proposal: data.proposal });
      onSettled?.(data.proposal);
    } catch (err) {
      dispatch({ type: "error", message: String((err as Error).message ?? err) });
    }
  }

  if (state.status === "idle") {
    return <div className="empty">No approval pending.</div>;
  }
  if (state.status === "loading") {
    return <div className="muted">Loading proposal {state.proposalId}...</div>;
  }
  if (state.status === "error") {
    return <div className="event tone-error">Approval error: {state.message}</div>;
  }

  const proposal =
    state.status === "settled" || state.status === "pending" || state.status === "deciding"
      ? state.proposal
      : null;
  if (!proposal) return null;

  return (
    <div>
      <div className="row">
        <strong className="grow">{proposal.title}</strong>
        <span className={`pill ${proposal.status}`}>{proposal.status}</span>
      </div>
      <p className="mono" style={{ whiteSpace: "pre-wrap" }}>
        {proposal.body}
      </p>
      {state.status === "settled" ? (
        <div className="muted">
          Decided{proposal.decidedAt ? ` at ${proposal.decidedAt}` : ""}.
        </div>
      ) : (
        <div className="row">
          <button
            className="approve"
            disabled={!canDecide(state)}
            onClick={() => decide("approve")}
          >
            {state.status === "deciding" && state.decision === "approve"
              ? "Approving..."
              : "Approve"}
          </button>
          <button
            className="deny"
            disabled={!canDecide(state)}
            onClick={() => decide("deny")}
          >
            {state.status === "deciding" && state.decision === "deny"
              ? "Denying..."
              : "Deny"}
          </button>
        </div>
      )}
    </div>
  );
}

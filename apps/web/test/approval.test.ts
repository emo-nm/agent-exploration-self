import { describe, it, expect } from "vitest";
import type { PublicationProposal } from "@demo/contracts";
import {
  approvalReducer,
  canDecide,
  decisionToStatus,
  initialApprovalState,
  proposalIdOf,
  type ApprovalState,
} from "../lib/approval";

const proposal = (over: Partial<PublicationProposal> = {}): PublicationProposal => ({
  id: "p1",
  threadId: "t1",
  title: "Draft",
  body: "body",
  status: "pending",
  createdAt: "2026-07-11T12:00:00.000Z",
  decidedAt: null,
  ...over,
});

describe("approval state machine", () => {
  it("loads then becomes pending for a pending proposal", () => {
    let s: ApprovalState = initialApprovalState;
    s = approvalReducer(s, { type: "load", proposalId: "p1" });
    expect(s.status).toBe("loading");
    s = approvalReducer(s, { type: "loaded", proposal: proposal() });
    expect(s.status).toBe("pending");
    expect(canDecide(s)).toBe(true);
  });

  it("goes straight to settled when the loaded proposal is already decided", () => {
    let s: ApprovalState = approvalReducer(initialApprovalState, {
      type: "load",
      proposalId: "p1",
    });
    s = approvalReducer(s, { type: "loaded", proposal: proposal({ status: "approved" }) });
    expect(s.status).toBe("settled");
    expect(canDecide(s)).toBe(false);
  });

  it("moves pending -> deciding -> settled", () => {
    let s: ApprovalState = approvalReducer(
      approvalReducer(initialApprovalState, { type: "load", proposalId: "p1" }),
      { type: "loaded", proposal: proposal() },
    );
    s = approvalReducer(s, { type: "decide", decision: "approve" });
    expect(s.status).toBe("deciding");
    expect(canDecide(s)).toBe(false); // guards against double-submit
    s = approvalReducer(s, { type: "settled", proposal: proposal({ status: "approved" }) });
    expect(s.status).toBe("settled");
  });

  it("ignores a decide action when not pending (double-click guard)", () => {
    const deciding: ApprovalState = {
      status: "deciding",
      proposal: proposal(),
      decision: "approve",
    };
    const s = approvalReducer(deciding, { type: "decide", decision: "deny" });
    expect(s).toBe(deciding);
  });

  it("captures the proposal id on error and resets to idle", () => {
    const pending: ApprovalState = { status: "pending", proposal: proposal() };
    const err = approvalReducer(pending, { type: "error", message: "network" });
    expect(err.status).toBe("error");
    expect(proposalIdOf(err)).toBe("p1");
    expect(approvalReducer(err, { type: "reset" })).toEqual(initialApprovalState);
  });

  it("maps decisions to proposal statuses", () => {
    expect(decisionToStatus("approve")).toBe("approved");
    expect(decisionToStatus("deny")).toBe("denied");
  });

  it("does not reload an already-settled proposal with the same id", () => {
    const settled: ApprovalState = { status: "settled", proposal: proposal({ status: "approved" }) };
    expect(approvalReducer(settled, { type: "load", proposalId: "p1" })).toBe(settled);
    expect(approvalReducer(settled, { type: "load", proposalId: "p2" }).status).toBe("loading");
  });
});

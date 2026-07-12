import { NextResponse } from "next/server";
import { getRepo } from "../../../../lib/repo";
import { decisionToStatus, type Decision } from "../../../../lib/approval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/proposals/:id -> current proposal row (the approval card polls this).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const proposal = await getRepo().getProposal(id);
  if (!proposal) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ proposal });
}

// POST /api/proposals/:id  { decision: "approve" | "deny" }
// Flips the proposal row's status; the agent polls get_publication_status and
// then publishes on approval (the application-owned approval gate).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { decision?: Decision };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json(
      { error: 'decision must be "approve" or "deny"' },
      { status: 400 },
    );
  }
  const repo = getRepo();
  const existing = await repo.getProposal(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status !== "pending") {
    // Idempotent-ish: refuse to re-decide an already-settled proposal.
    return NextResponse.json(
      { error: `proposal already ${existing.status}`, proposal: existing },
      { status: 409 },
    );
  }
  const proposal = await repo.setProposalStatus(
    id,
    decisionToStatus(body.decision),
    new Date().toISOString(),
  );
  return NextResponse.json({ proposal });
}

import { NextResponse } from "next/server";
import { getRepo } from "../../../lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/proposals  { threadId?, title, body }
// Application-owned proposals flow. In a real run the agent's
// create_publication_proposal tool inserts this row; this endpoint lets the UI
// exercise the approve/deny loop against the live repo without a model key.
export async function POST(req: Request) {
  let input: { threadId?: string | null; title?: string; body?: string };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const title = input.title?.trim() || "Untitled draft";
  const body = input.body?.trim() || "(no body)";
  const id = `prop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const proposal = await getRepo().createProposal({
    id,
    threadId: input.threadId ?? null,
    title,
    body,
  });
  return NextResponse.json({ proposal });
}

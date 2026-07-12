import { NextResponse } from "next/server";
import { isBackend } from "../../../../lib/backends";
import { getRepo } from "../../../../lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function newThreadId(): string {
  return `thr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// POST /api/:backend/thread  -> create a demo_threads row, return {thread}
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ backend: string }> },
) {
  const { backend } = await params;
  if (!isBackend(backend)) {
    return NextResponse.json({ error: `unknown backend: ${backend}` }, { status: 404 });
  }
  const repo = getRepo();
  const thread = await repo.createThread({ id: newThreadId(), backend });
  return NextResponse.json({ thread });
}

// GET /api/:backend/thread?id=... -> fetch one thread row (thread selector uses
// this to reopen a thread id the browser remembers; the repo has no list API,
// so the client keeps the id list in localStorage — see notes).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ backend: string }> },
) {
  const { backend } = await params;
  if (!isBackend(backend)) {
    return NextResponse.json({ error: `unknown backend: ${backend}` }, { status: 404 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const thread = await getRepo().getThread(id);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ thread });
}

import { NextResponse } from "next/server";
import { isBackend } from "../../../../lib/backends";
import { runTurn } from "../../../../lib/agent-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/:backend/message  { threadId, message }
// Streams normalized AgentEvents to the browser as Server-Sent Events. Each
// `data:` line is one JSON AgentEvent (with its `raw` native payload attached).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ backend: string }> },
) {
  const { backend } = await params;
  if (!isBackend(backend)) {
    return NextResponse.json({ error: `unknown backend: ${backend}` }, { status: 404 });
  }

  let body: { threadId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const threadId = body.threadId?.trim();
  const message = body.message?.trim();
  if (!threadId || !message) {
    return NextResponse.json(
      { error: "threadId and message are required" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const event of runTurn(backend, threadId, message)) {
          send(event);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: detail, ts: new Date().toISOString() });
      } finally {
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

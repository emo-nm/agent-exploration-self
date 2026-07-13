// Voice loop for the eve demo (criterion 6) — BYO path. eve has NO voice
// surface of its own (it is turn-based text), so we bolt one on as an additive
// custom channel: POST /voice/turn. The wiring cost here IS the finding —
// compare against Mastra, which exposes voice natively on the agent.
//
// SELF-CONTAINED on purpose: eve's channel bundler requires an authored module
// to bundle to exactly ONE chunk, and importing our shared raw-TS @demo/voice
// (which pulls the AI SDK) breaks that ("Expected one bundled authored
// module") — found live deploying to Vercel 07-13. Same escape-hatch-tax
// family as the caching finding: leave eve's happy path and shared workspace
// code stops being loadable. So this channel re-implements the tiny
// transcribe/synthesize seam with raw fetch to OpenAI. Flue and Mastra keep
// using @demo/voice.
//
// Flow: audio in -> whisper transcribe -> drive ONE normal eve turn via the
// channel's in-server `send()` (the same durable session primitive the eve TUI
// and adapter use) -> read the assistant reply from the session event stream ->
// tts synthesize -> return { transcript, reply, audio(base64), mime }.
import { defineChannel, POST } from "eve/channels";

const OPENAI = "https://api.openai.com/v1";

function requireKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("voice unavailable: OPENAI_API_KEY is not set");
  }
  return key;
}

async function transcribe(audio: Uint8Array, mime: string): Promise<string> {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append(
    "file",
    new File([audio as BlobPart], "audio", { type: mime || "audio/mpeg" }),
  );
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${requireKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { text?: string };
  return body.text ?? "";
}

async function synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }> {
  const res = await fetch(`${OPENAI}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text }),
  });
  if (!res.ok) throw new Error(`synthesize ${res.status}: ${await res.text()}`);
  return { audio: new Uint8Array(await res.arrayBuffer()), mime: "audio/mpeg" };
}

export default defineChannel({
  routes: [
    POST("/voice/turn", async (req, { send }) => {
      const body = (await req.json()) as {
        audio?: string;
        mime?: string;
        text?: string;
        threadId?: string;
      };
      if (!body.audio && !body.text) {
        return Response.json(
          { error: "JSON body must include a base64 'audio' string or a 'text' field" },
          { status: 400 },
        );
      }
      const transcript =
        body.text ??
        (await transcribe(
          new Uint8Array(Buffer.from(body.audio!, "base64")),
          body.mime ?? "audio/mpeg",
        ));

      // Drive ONE eve turn via the channel's in-server durable session, then
      // read the assistant reply off the session's event stream.
      const session = await send(transcript, {
        auth: null,
        continuationToken: body.threadId ?? "voice-turn",
      });
      let reply = "";
      const stream = await session.getEventStream();
      for await (const event of stream) {
        const e = event as { type: string; data?: Record<string, unknown> };
        if (e.type === "message.completed") reply = String(e.data?.message ?? "");
      }

      const spoken = await synthesize(reply);
      return Response.json({
        transcript,
        reply,
        audio: Buffer.from(spoken.audio).toString("base64"),
        mime: spoken.mime,
      });
    }),
  ],
});

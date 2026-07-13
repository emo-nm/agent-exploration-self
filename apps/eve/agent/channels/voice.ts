// Voice loop for the eve demo (criterion 6) — BYO path. eve has NO voice
// surface of its own (it is turn-based text), so we bolt one on as an additive
// custom channel: POST /voice/turn. The wiring cost here IS the finding —
// compare against Mastra, which exposes voice natively on the agent.
//
// Flow: audio in -> @demo/voice.transcribe -> drive ONE normal eve turn via the
// channel's in-server `send()` (the same durable session primitive the eve TUI
// and adapter use) -> read the assistant reply from the session event stream ->
// @demo/voice.synthesize -> return { transcript, reply, audio(base64), mime }.
import { defineChannel, POST } from "eve/channels";
import { createSpeech, handleVoiceTurn, voiceTurnResponseBody } from "@demo/voice";

export default defineChannel({
  routes: [
    POST("/voice/turn", async (req, { send }) => {
      const result = await handleVoiceTurn(req, {
        speech: createSpeech(), // throws VoiceUnavailableError if OPENAI_API_KEY unset
        // Drive ONE eve turn via the channel's in-server durable session, then
        // read the assistant reply off the session's event stream. The channel
        // owns its continuation-token format; a stable token resumes the session.
        runTurn: async (transcript, threadId) => {
          const session = await send(transcript, {
            auth: null,
            continuationToken: threadId ?? "voice-turn",
          });
          let reply = "";
          const stream = await session.getEventStream();
          for await (const event of stream) {
            const e = event as { type: string; data?: Record<string, unknown> };
            if (e.type === "message.completed") reply = String(e.data?.message ?? "");
          }
          return reply;
        },
      });
      return Response.json(voiceTurnResponseBody(result));
    }),
  ],
});

// Thin, framework-neutral request/response helpers for the POST /voice/turn
// endpoint that Eve, Flue, and Mastra each expose. Keeping the parse + encode
// here means each app's route stays ~identical and truly thin (the wiring cost
// we're measuring lives in how each framework registers the route and drives a
// turn, NOT in bespoke multipart plumbing per app).
//
// Input accepts either multipart/form-data (an `audio` file field) or JSON with
// a base64 `audio` string. A `text` field, when present, lets a caller skip
// transcription (handy for smoke tests). Output is JSON: the transcript, the
// agent reply text, and the reply audio as base64 + its mime.

import type { Speech } from "./index.js";

export interface VoiceTurnInput {
  audio: Uint8Array;
  mime: string;
  /** If set, transcription is skipped and this text drives the turn. */
  text?: string;
  /** Optional conversation/thread id so turns accumulate in one session. */
  threadId?: string;
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Parse a /voice/turn request body (multipart or base64-JSON) into audio bytes. */
export async function readVoiceTurnInput(req: Request): Promise<VoiceTurnInput> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("audio");
    const text = (form.get("text") as string | null) ?? undefined;
    const threadId = (form.get("threadId") as string | null) ?? undefined;
    if (!(file instanceof Blob)) {
      if (text) return { audio: new Uint8Array(), mime: "text/plain", text, threadId };
      throw new Error("voice/turn: multipart body must include an 'audio' file field");
    }
    const audio = new Uint8Array(await file.arrayBuffer());
    const mime =
      (file instanceof File && file.type) ||
      (form.get("mime") as string | null) ||
      "application/octet-stream";
    return { audio, mime, text, threadId };
  }
  const body = (await req.json()) as {
    audio?: string;
    mime?: string;
    text?: string;
    threadId?: string;
  };
  if (!body.audio && !body.text) {
    throw new Error("voice/turn: JSON body must include a base64 'audio' string or a 'text' field");
  }
  return {
    audio: body.audio ? base64ToBytes(body.audio) : new Uint8Array(),
    mime: body.mime ?? "application/octet-stream",
    text: body.text,
    threadId: body.threadId,
  };
}

export interface VoiceTurnResult {
  transcript: string;
  reply: string;
  audio: Uint8Array;
  mime: string;
}

/**
 * Drive one agent turn from a speaker. `runTurn` is the ONLY per-framework
 * piece — Eve/Flue/Mastra each pass their own turn driver, keeping their route
 * a thin adapter and the transcribe -> turn -> synthesize seam identical (and
 * unit-testable with a FakeSpeech + a stubbed runTurn — no model or network).
 */
export type RunAgentTurn = (transcript: string, threadId: string | undefined) => Promise<string>;

export async function handleVoiceTurn(
  req: Request,
  deps: { speech: Speech; runTurn: RunAgentTurn },
): Promise<VoiceTurnResult> {
  const input = await readVoiceTurnInput(req);
  const transcript = input.text ?? (await deps.speech.transcribe(input.audio, input.mime));
  const reply = await deps.runTurn(transcript, input.threadId);
  const spoken = await deps.speech.synthesize(reply);
  return { transcript, reply, audio: spoken.audio, mime: spoken.mime };
}

/** Serialize a voice-turn result to the JSON body all three endpoints return. */
export function voiceTurnResponseBody(result: VoiceTurnResult): {
  transcript: string;
  reply: string;
  audio: string;
  mime: string;
} {
  return {
    transcript: result.transcript,
    reply: result.reply,
    audio: bytesToBase64(result.audio),
    mime: result.mime,
  };
}

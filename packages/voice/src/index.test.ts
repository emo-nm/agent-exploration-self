import { describe, expect, it } from "vitest";
import {
  createSpeech,
  createOpenAIVoiceModels,
  FakeSpeech,
  VoiceUnavailableError,
  handleVoiceTurn,
  readVoiceTurnInput,
  voiceTurnResponseBody,
} from "./index.js";

describe("FakeSpeech", () => {
  it("round-trips synthesize -> transcribe exactly", async () => {
    const speech = new FakeSpeech();
    const { audio, mime } = await speech.synthesize("hello from the voice loop");
    expect(mime).toBe(FakeSpeech.MIME);
    expect(audio.byteLength).toBeGreaterThan(0);
    const text = await speech.transcribe(audio, mime);
    expect(text).toBe("hello from the voice loop");
  });

  it("decodes raw non-envelope bytes best-effort", async () => {
    const speech = new FakeSpeech();
    const bytes = new TextEncoder().encode("plain audio bytes");
    expect(await speech.transcribe(bytes, "audio/wav")).toBe("plain audio bytes");
  });
});

describe("createSpeech env gate", () => {
  it("throws VoiceUnavailableError naming the missing env var when no key", () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createSpeech()).toThrowError(VoiceUnavailableError);
      expect(() => createSpeech()).toThrowError(/OPENAI_API_KEY/);
      expect(createOpenAIVoiceModels()).toBeNull();
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("builds the live provider when a key is supplied explicitly", () => {
    const models = createOpenAIVoiceModels({ apiKey: "sk-test-not-used" });
    expect(models).not.toBeNull();
    expect(models?.transcribeModelId).toBe("whisper-1");
    expect(models?.speechModelId).toBe("tts-1");
    // Does not perform any network call — just constructs the model objects.
    expect(() => createSpeech({ apiKey: "sk-test-not-used" })).not.toThrow();
  });
});

describe("voice/turn http helpers", () => {
  it("reads a base64-JSON body", async () => {
    const audioB64 = Buffer.from("FAKEVOICE:hi").toString("base64");
    const req = new Request("http://x/voice/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audio: audioB64, mime: "audio/x-fake-voice", threadId: "t1" }),
    });
    const input = await readVoiceTurnInput(req);
    expect(input.mime).toBe("audio/x-fake-voice");
    expect(input.threadId).toBe("t1");
    expect(new TextDecoder().decode(input.audio)).toBe("FAKEVOICE:hi");
  });

  it("reads a multipart body with an audio file", async () => {
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1, 2, 3])], "a.wav", { type: "audio/wav" }));
    form.set("threadId", "t2");
    const req = new Request("http://x/voice/turn", { method: "POST", body: form });
    const input = await readVoiceTurnInput(req);
    expect(input.mime).toBe("audio/wav");
    expect(input.threadId).toBe("t2");
    expect([...input.audio]).toEqual([1, 2, 3]);
  });

  it("rejects a JSON body with neither audio nor text", async () => {
    const req = new Request("http://x/voice/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    await expect(readVoiceTurnInput(req)).rejects.toThrow(/audio.*text/i);
  });

  it("encodes a response body to base64 audio", () => {
    const body = voiceTurnResponseBody({
      transcript: "in",
      reply: "out",
      audio: new TextEncoder().encode("FAKEVOICE:out"),
      mime: "audio/x-fake-voice",
    });
    expect(body.transcript).toBe("in");
    expect(body.reply).toBe("out");
    expect(body.mime).toBe("audio/x-fake-voice");
    expect(Buffer.from(body.audio, "base64").toString()).toBe("FAKEVOICE:out");
  });
});

// handleVoiceTurn is the shared core every app's /voice/turn route runs — the
// only per-app difference is `runTurn`. Test it with the fake speech injected
// and the agent turn stubbed (no model, no network): exactly the coverage each
// app's handler needs, since their routes are thin adapters over this.
describe("handleVoiceTurn (fake speech + stubbed agent turn)", () => {
  it("transcribes audio, drives the turn, and returns synthesized reply audio", async () => {
    const speech = new FakeSpeech();
    const { audio } = await speech.synthesize("summarize the doc");
    const req = new Request("http://x/voice/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio: Buffer.from(audio).toString("base64"),
        mime: FakeSpeech.MIME,
        threadId: "t9",
      }),
    });

    const seen: { transcript: string; threadId: string | undefined } = {
      transcript: "",
      threadId: "",
    };
    const result = await handleVoiceTurn(req, {
      speech,
      runTurn: async (transcript, threadId) => {
        seen.transcript = transcript;
        seen.threadId = threadId;
        return `echo: ${transcript}`;
      },
    });

    expect(seen.transcript).toBe("summarize the doc");
    expect(seen.threadId).toBe("t9");
    expect(result.transcript).toBe("summarize the doc");
    expect(result.reply).toBe("echo: summarize the doc");
    // reply audio round-trips back through the fake transcriber.
    expect(await speech.transcribe(result.audio, result.mime)).toBe("echo: summarize the doc");
  });

  it("honors a `text` field to skip transcription", async () => {
    const req = new Request("http://x/voice/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "typed not spoken" }),
    });
    let drivenWith = "";
    const result = await handleVoiceTurn(req, {
      speech: new FakeSpeech(),
      runTurn: async (transcript) => {
        drivenWith = transcript;
        return "ok";
      },
    });
    expect(drivenWith).toBe("typed not spoken");
    expect(result.transcript).toBe("typed not spoken");
  });
});

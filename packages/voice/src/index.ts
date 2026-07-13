// @demo/voice — one shared speech helper for the INT-27 evaluation (criterion 6,
// "can it host a live voice loop?"). Same shape and spirit as @demo/model: a
// provider seam that the three frameworks consume identically.
//
// PROBLEM this solves: criterion 6 was scored [doc] only — Mastra has a
// first-class voice module, Eve and Flue have none. To score it [live] and to
// measure the BYO wiring cost, all three need the same speech capability behind
// one seam. That seam is `createSpeech()`.
//
// DESIGN: `createSpeech()` returns a `Speech` — transcribe(audio) -> text and
// synthesize(text) -> audio. The live implementation uses the AI SDK v7
// experimental transcribe/generateSpeech functions against OpenAI (whisper-1 +
// tts-1 by default). If OPENAI_API_KEY is absent it throws VoiceUnavailableError
// naming the missing var, so the wiring is present but the failure is loud and
// specific (never a silent no-op). `FakeSpeech` is a deterministic, offline
// round-trippable double for unit tests and for exercising the /voice/turn
// handlers without a network or a key.

import {
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
  type SpeechModel,
  type TranscriptionModel,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export * from "./http.js";

/** Thrown when a live speech provider is requested but its key is not set. */
export class VoiceUnavailableError extends Error {
  constructor(public readonly missingEnvVar: string) {
    super(
      `Voice is unavailable: ${missingEnvVar} is not set. ` +
        `Set ${missingEnvVar} to enable the live speech provider, or use FakeSpeech in tests.`,
    );
    this.name = "VoiceUnavailableError";
  }
}

/** The provider seam. Both the live and fake providers implement this. */
export interface Speech {
  /** Audio bytes + IANA mime in, transcript text out. */
  transcribe(audio: Uint8Array, mime: string): Promise<string>;
  /** Text in, audio bytes + IANA mime out. */
  synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }>;
}

export interface CreateSpeechOptions {
  apiKey?: string;
  /** OpenAI transcription model id. Default whisper-1 (override: VOICE_TRANSCRIBE_MODEL). */
  transcribeModel?: string;
  /** OpenAI speech model id. Default tts-1 (override: VOICE_SPEECH_MODEL). */
  speechModel?: string;
  /** TTS voice. Default "alloy" (override: VOICE_TTS_VOICE). */
  voice?: string;
  /** TTS output format. Default "mp3". */
  outputFormat?: "mp3" | "wav";
}

export const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";
export const DEFAULT_SPEECH_MODEL = "tts-1";
export const DEFAULT_TTS_VOICE = "alloy";

/**
 * Build the OpenAI transcription + speech models behind the env-var gate.
 * Returns `null` when no key is set (callers that want a soft gate use this;
 * `createSpeech` uses it and throws instead). Exported so Mastra can feed the
 * raw AI SDK models into its native CompositeVoice (its voice module wants
 * model objects, not our `Speech` facade).
 */
export function createOpenAIVoiceModels(options: CreateSpeechOptions = {}): {
  transcription: TranscriptionModel;
  speech: SpeechModel;
  transcribeModelId: string;
  speechModelId: string;
} | null {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const openai = createOpenAI({ apiKey });
  const transcribeModelId =
    options.transcribeModel ?? process.env.VOICE_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL;
  const speechModelId =
    options.speechModel ?? process.env.VOICE_SPEECH_MODEL ?? DEFAULT_SPEECH_MODEL;
  return {
    transcription: openai.transcription(transcribeModelId),
    speech: openai.speech(speechModelId),
    transcribeModelId,
    speechModelId,
  };
}

/**
 * The live, OpenAI-backed speech provider. Throws VoiceUnavailableError if
 * OPENAI_API_KEY (or an explicit apiKey) is missing — the moment a key exists,
 * this works with no other change.
 */
export function createSpeech(options: CreateSpeechOptions = {}): Speech {
  const models = createOpenAIVoiceModels(options);
  if (!models) throw new VoiceUnavailableError("OPENAI_API_KEY");
  const voice = options.voice ?? process.env.VOICE_TTS_VOICE ?? DEFAULT_TTS_VOICE;
  const outputFormat = options.outputFormat ?? "mp3";
  return {
    async transcribe(audio: Uint8Array): Promise<string> {
      const result = await transcribe({ model: models.transcription, audio });
      return result.text;
    },
    async synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }> {
      const result = await generateSpeech({
        model: models.speech,
        text,
        voice,
        outputFormat,
      });
      return {
        audio: result.audio.uint8Array,
        mime: result.audio.mediaType || (outputFormat === "wav" ? "audio/wav" : "audio/mpeg"),
      };
    },
  };
}

/**
 * A deterministic, offline speech double. `synthesize` encodes the text into a
 * self-describing byte envelope; `transcribe` decodes it back — so a
 * synthesize -> transcribe round-trip returns the original text exactly. Lets
 * unit tests and the /voice/turn handlers run with no key and no network.
 */
export class FakeSpeech implements Speech {
  static readonly MIME = "audio/x-fake-voice";
  private static readonly PREFIX = "FAKEVOICE:";

  async transcribe(audio: Uint8Array, _mime: string): Promise<string> {
    const decoded = new TextDecoder().decode(audio);
    if (decoded.startsWith(FakeSpeech.PREFIX)) {
      return decoded.slice(FakeSpeech.PREFIX.length);
    }
    // Not one of our envelopes — surface the raw bytes as a best-effort string
    // so a handler test can still assert on deterministic input.
    return decoded;
  }

  async synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }> {
    const audio = new TextEncoder().encode(FakeSpeech.PREFIX + text);
    return { audio, mime: FakeSpeech.MIME };
  }
}

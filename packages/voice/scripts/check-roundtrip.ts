// Live round-trip smoke check for @demo/voice (criterion 6).
//
// Synthesizes a short phrase to audio via the OpenAI path, transcribes that
// audio back, and reports whether the round-trip text matches (case/punct
// insensitive). Requires OPENAI_API_KEY in the environment.
//
//   source .env && pnpm --filter @demo/voice check:roundtrip
//
// Prints models used, latency, and the transcript match. Never prints the key.

import { createSpeech, createOpenAIVoiceModels, VoiceUnavailableError } from "../src/index.js";

const PHRASE = process.env.VOICE_PHRASE ?? "The quick brown fox jumps over the lazy dog.";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  let speech;
  try {
    speech = createSpeech();
  } catch (err) {
    if (err instanceof VoiceUnavailableError) {
      console.error(`SKIP: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  const models = createOpenAIVoiceModels()!;
  console.log(`speech model:      ${models.speechModelId}`);
  console.log(`transcribe model:  ${models.transcribeModelId}`);
  console.log(`phrase:            "${PHRASE}"`);

  const tSpeak = Date.now();
  const { audio, mime } = await speech.synthesize(PHRASE);
  const speakMs = Date.now() - tSpeak;
  console.log(`synthesized:       ${audio.byteLength} bytes (${mime}) in ${speakMs}ms`);

  const tListen = Date.now();
  const transcript = await speech.transcribe(audio, mime);
  const listenMs = Date.now() - tListen;
  console.log(`transcribed:       "${transcript}" in ${listenMs}ms`);

  const match = normalize(transcript) === normalize(PHRASE);
  const contains = normalize(transcript).includes(normalize(PHRASE));
  console.log(`normalized match:  ${match}`);
  console.log(`total latency:     ${speakMs + listenMs}ms`);

  if (!match && !contains) {
    console.error("FAIL: round-trip transcript did not match the phrase");
    process.exit(1);
  }
  console.log("OK: voice round-trip verified live");
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});

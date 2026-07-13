# Voice loop wiring — criterion 6, built three times (2026-07-13)

Criterion 6 ("can it host a live voice loop, or only turn-based text?") was
scored [doc] before today. This session builds it [live]: a shared speech seam
plus a `POST /voice/turn` endpoint in each of Eve, Flue, and Mastra, and a live
OpenAI round-trip through the seam. **The wiring-cost difference between the
frameworks IS the finding.**

## What was built

### `packages/voice` (`@demo/voice`) — the shared seam

Same style as `@demo/model`. Exports:

- `createSpeech(opts?) -> Speech` where `Speech` is
  `{ transcribe(audio: Uint8Array, mime): Promise<string>; synthesize(text): Promise<{audio: Uint8Array; mime}> }`.
  Live impl uses AI SDK v7 `experimental_transcribe` / `experimental_generateSpeech`
  against OpenAI (`@ai-sdk/openai@4`), default models **whisper-1** (STT) and
  **tts-1** (TTS), voice `alloy`. All overridable via
  `VOICE_TRANSCRIBE_MODEL` / `VOICE_SPEECH_MODEL` / `VOICE_TTS_VOICE`.
- `createOpenAIVoiceModels(opts?)` — returns the raw AI SDK transcription+speech
  model objects (or `null` if no key). Mastra consumes this for its native voice
  module.
- `VoiceUnavailableError` — thrown by `createSpeech()` when `OPENAI_API_KEY` is
  unset, naming the missing var. The wiring is always present; the failure is
  loud and specific, never a silent no-op.
- `FakeSpeech` — deterministic, offline, round-trippable double for tests.
- `handleVoiceTurn(req, { speech, runTurn })` + `readVoiceTurnInput` +
  `voiceTurnResponseBody` — the shared HTTP core. `runTurn` is the ONLY
  per-framework piece, so all three routes are thin adapters over one seam.

The provider seam means **live speech works the moment a key is set**; unit
tests run against `FakeSpeech` with no key and no network.

Version note: `ai@7.0.22` -> `@ai-sdk/provider@4.0.3`; the matching OpenAI
provider is `@ai-sdk/openai@4.0.11` (same provider/provider-utils). Added as a
`packages/voice` dep.

### Mastra — NATIVE path

Mastra's `@mastra/core` ships a first-class voice module. The
`research-publisher` agent now gets a real `voice` capability (gated on the same
env var): `new CompositeVoice({ input: new AISDKTranscription(...), output: new
AISDKSpeech(...) })`, fed by `createOpenAIVoiceModels()`. If no key, `voice` is
left off and the agent stays text-only.

- File: `apps/mastra/src/mastra/agents/research-publisher-agent.ts` (voice config)
  and `apps/mastra/src/mastra/index.ts` (the parity `/voice/turn` apiRoute).
- **Framework friction (fighting-the-framework signal):** `@demo/voice` builds
  AI SDK **v7** models, but `@mastra/core`'s voice module is typed against its
  bundled AI SDK **v5** model interfaces (`@internal_ai-sdk-v5`, `SpeechModelV2`
  / `TranscriptionModelV2`). Runtime contract is compatible (both are AISDK*
  duck types), so the major-version type skew is bridged with a single cast at
  that seam. Real but minor; noted per the eval rules.
- Import note: `AISDKSpeech`/`AISDKTranscription`/`CompositeVoice` must come from
  `@mastra/core/voice` (the `.../voice/aisdk` subpath is not a package export);
  the model *type* names are not re-exported, so the cast target is derived from
  the constructors (`ConstructorParameters<typeof AISDKSpeech>[0]`).

**Does Mastra expose voice HTTP endpoints automatically?** No — checked the
installed server routes. `@mastra/core`'s server (`registerApiRoute`,
`server/handlers`) exposes agent generate/stream/memory routes; there is **no**
auto-generated `voice`/`speak`/`listen` HTTP route wired from an agent's `voice`
config. The `voice` capability is a programmatic surface on the agent object
(`agent.voice.speak()` / `.listen()`), not an HTTP endpoint. So even on the
native path, exposing voice over HTTP is app work — which is why the mastra
`/voice/turn` apiRoute exists (parity with Eve/Flue), and it drives the turn via
`agent.generate` + `@demo/voice` STT/TTS rather than the agent's own `voice`.
The native win is that the capability is a real, typed part of the agent and its
event model; the HTTP exposure is comparable effort everywhere.

### Eve — BYO path

Eve is turn-based text with no voice surface, so voice is bolted on as an
additive **custom channel** (single new file, no edits to existing channels):
`apps/eve/agent/channels/voice.ts` -> `POST /voice/turn`. `runTurn` drives one
in-server durable eve session via the channel's `send()` and reads the assistant
reply off `session.getEventStream()`.

### Flue — BYO path

Flue has no live-voice surface (its channels treat audio as a message-attachment
type). One additive route in `apps/flue/src/app.ts`: `POST /voice/turn`, mounted
before `app.route("/", flue())`. `runTurn` drives one turn to completion via the
SDK's `client.agents.prompt(...)` (the `?wait=result` path, the same
run-to-completion primitive the app already uses) looped back over HTTP to this
server — Flue exposes no in-process invoke.

## Finding: wiring cost

| | Voice capability source | `/voice/turn` route | Net app code |
|---|---|---|---|
| Mastra | **native** `voice` on the agent (CompositeVoice + AISDK classes) | app apiRoute entry | agent voice config (~12 lines, incl. a version-skew cast) + thin route |
| Eve | **BYO** (`@demo/voice`) | new custom channel file | ~1 thin file |
| Flue | **BYO** (`@demo/voice`) | 1 route in `app.ts` + self-HTTP prompt | ~1 thin block |

The shared `@demo/voice` seam flattens most of the per-app difference (all three
routes are ~identical adapters over `handleVoiceTurn`). The remaining, real
difference: **Mastra models voice as a first-class agent capability** (typed
`voice` on the agent, voice event map) even though HTTP exposure is still app
work; **Eve and Flue have no voice concept at all** — voice only exists because
we built the seam and a turn adapter. If you strip `@demo/voice`, Mastra still
has a voice object on the agent; Eve and Flue have nothing.

## Live verification (round-trip through the seam)

Ran `packages/voice/scripts/check-roundtrip.ts` with `OPENAI_API_KEY` set
(loaded from repo `.env`; key never printed):

- speech model `tts-1`, transcribe model `whisper-1`
- phrase: "The quick brown fox jumps over the lazy dog."
- synthesize: 55,680 bytes `audio/mpeg` in **3,690 ms**
- transcribe back: "The quick brown fox jumps over the lazy dog." in **1,590 ms**
- normalized transcript match: **true** (exact) — total **5,280 ms**

This exercises the live OpenAI path end to end (TTS then STT). The three
`/voice/turn` endpoints were NOT hit live here (dev-server ports are owned by
another agent); they get FakeSpeech unit tests and are typecheck-clean. Endpoint
live-testing is deferred to post-merge.

## Tests

`packages/voice` vitest (10 tests): FakeSpeech round-trip, the `createSpeech`
env gate (throws `VoiceUnavailableError` naming `OPENAI_API_KEY`; builds when a
key is supplied), the multipart + base64-JSON body parsers, and
`handleVoiceTurn` with FakeSpeech injected + the agent turn stubbed (the exact
core each app route runs). No live model calls in tests.

## Run it live (once a key exists)

Seam round-trip (no servers):

```
source .env && pnpm --filter @demo/voice check:roundtrip
```

Per backend (`OPENAI_API_KEY` must be set in the server's env; base64-audio JSON
shown, multipart with an `audio` file field also works). Start the app's dev
server first (owned by another agent here):

```
# Eve (port 3001)
curl -s localhost:3001/voice/turn -H 'content-type: application/json' \
  -d '{"audio":"<base64-mp3>","mime":"audio/mpeg","threadId":"demo"}'

# Flue (port 3002)
curl -s localhost:3002/voice/turn -H 'content-type: application/json' \
  -d '{"audio":"<base64-mp3>","mime":"audio/mpeg","threadId":"demo"}'

# Mastra (port 3003)
curl -s localhost:3003/voice/turn -H 'content-type: application/json' \
  -d '{"audio":"<base64-mp3>","mime":"audio/mpeg","threadId":"demo"}'
```

Each returns `{ transcript, reply, audio (base64), mime }`. Without a key the
endpoints return `503 { error: "Voice is unavailable: OPENAI_API_KEY ..." }`
(Eve surfaces the same `VoiceUnavailableError`).

## Files touched

- NEW `packages/voice/` (`package.json`, `tsconfig.json`, `src/index.ts`,
  `src/http.ts`, `src/index.test.ts`, `scripts/check-roundtrip.ts`)
- `apps/eve/package.json` (+`@demo/voice`), NEW `apps/eve/agent/channels/voice.ts`
- `apps/flue/package.json` (+`@demo/voice`), `apps/flue/src/app.ts`
- `apps/mastra/package.json` (+`@demo/voice`),
  `apps/mastra/src/mastra/index.ts`,
  `apps/mastra/src/mastra/agents/research-publisher-agent.ts`
- `pnpm-lock.yaml` (from `pnpm install`)

Typecheck clean in `@demo/voice`, eve, flue, mastra. Existing suites pass
(eve 411, flue 6, mastra 6, voice 10).

STATE criterion 6 should move from [doc] to [live] for the seam + round-trip
(Mastra native voice capability confirmed at the code level; Eve/Flue have no
voice concept — confirmed). Left for the coordinator to fold into STATE.

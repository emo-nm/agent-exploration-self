// Application entrypoint: composes Flue's public agent routes with the
// application's own health/info and the application-owned approval surface
// (handoff #17). Flue's generated Node server wraps this default export.
import { Hono } from "hono";
import { flue } from "@flue/runtime/routing";
import { registerProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";
import { createSpeech, handleVoiceTurn, voiceTurnResponseBody } from "@demo/voice";
import { getStores } from "./shared/stores.ts";
import { RESEARCH_PUBLISHER_AGENT, toFlueInstanceId } from "./shared/instance-id.ts";

// Reach the shared model through OpenRouter's OpenAI-compatible endpoint. This
// overrides the built-in `openrouter` catalog provider with an explicit
// baseUrl/apiKey and registers metadata for DEMO_MODEL_ID so an id the local
// catalog snapshot may not know still resolves. OPENROUTER_API_KEY is loaded
// from the project-root .env by the Flue CLI before this module runs.
const DEMO_MODEL_ID = process.env.DEMO_MODEL_ID ?? "anthropic/claude-sonnet-5";
if (process.env.OPENROUTER_API_KEY) {
    registerProvider("openrouter", {
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        models: {
            [DEMO_MODEL_ID]: { contextWindow: 200_000, maxTokens: 8_192 },
        },
    });
}

const app = new Hono();

// --- Health / info for adapters and probes -------------------------------
app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/info", (c) =>
    c.json({
        service: "flue",
        agent: RESEARCH_PUBLISHER_AGENT,
        port: Number(process.env.PORT ?? 3002),
        persistence: getStores().backend,
        endpoints: {
            prompt: `POST /agents/${RESEARCH_PUBLISHER_AGENT}/:id`,
            stream: `GET /agents/${RESEARCH_PUBLISHER_AGENT}/:id`,
            pendingProposals: "GET /proposals",
            decide: "POST /proposals/:id/decision",
        },
    }),
);

// --- Application-owned approval surface (handoff #17) ---------------------
// The UI reads pending proposals and writes the human's decision here; the
// agent's get_publication_status tool polls the same store. Approval is never
// owned by the framework or the model.
app.get("/proposals", async (c) => {
    const pending = await getStores().proposals.listPending();
    return c.json({ pending });
});

app.get("/proposals/:id", async (c) => {
    const proposal = await getStores().proposals.get(c.req.param("id"));
    if (!proposal) return c.json({ error: "not found" }, 404);
    return c.json({ proposal });
});

app.post("/proposals/:id/decision", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "invalid JSON body" }, 400);
    }
    const decision = (body as { decision?: unknown }).decision;
    if (decision !== "approved" && decision !== "denied") {
        return c.json(
            { error: "decision must be 'approved' or 'denied'" },
            400,
        );
    }
    try {
        const proposal = await getStores().proposals.decide(id, decision);
        return c.json({ proposal });
    } catch (err) {
        return c.json({ error: (err as Error).message }, 409);
    }
});

// --- Voice loop (criterion 6) — BYO path ---------------------------------
// Flue has NO voice surface (its channels treat audio as a message attachment
// type, not a live loop), so we add one: audio in -> @demo/voice.transcribe ->
// drive ONE turn to completion via the SDK's `agents.prompt` (the ?wait=result
// path, the same run-to-completion primitive the app already uses) against this
// server -> @demo/voice.synthesize -> audio + transcript JSON. The wiring cost
// here IS the finding vs Mastra's native voice module.
app.post("/voice/turn", async (c) => {
    let speech;
    try {
        speech = createSpeech(); // throws VoiceUnavailableError if OPENAI_API_KEY unset
    } catch (err) {
        return c.json({ error: (err as Error).message }, 503);
    }
    const result = await handleVoiceTurn(c.req.raw, {
        speech,
        // Drive ONE turn to completion via the SDK's agents.prompt (?wait=result,
        // the same run-to-completion primitive the app already uses) against this
        // server. Flue owns no in-process invoke, so this loops back over HTTP.
        runTurn: async (transcript, threadId) => {
            const port = Number(process.env.PORT ?? 3002);
            const client = createFlueClient({ baseUrl: `http://127.0.0.1:${port}` });
            const instanceId = toFlueInstanceId(threadId ?? "voice-thread");
            const res = await client.agents.prompt(RESEARCH_PUBLISHER_AGENT, instanceId, {
                message: transcript,
            });
            return res.result?.text ?? "";
        },
    });
    return c.json(voiceTurnResponseBody(result));
});

// --- Flue public agent routes --------------------------------------------
app.route("/", flue());

export default app;

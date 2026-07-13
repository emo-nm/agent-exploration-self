// Application entrypoint: composes Flue's public agent routes with the
// application's own health/info and the application-owned approval surface
// (handoff #17). Flue's generated Node server wraps this default export.
import { Hono } from "hono";
import { flue } from "@flue/runtime/routing";
import { registerProvider } from "@flue/runtime";
import { getStores } from "./shared/stores.ts";
import { RESEARCH_PUBLISHER_AGENT } from "./shared/instance-id.ts";

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

// --- Flue public agent routes --------------------------------------------
app.route("/", flue());

export default app;

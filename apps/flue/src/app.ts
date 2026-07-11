// Application entrypoint: composes Flue's public agent routes with the
// application's own health/info and the application-owned approval surface
// (handoff §17). Flue's generated Node server wraps this default export.
import { Hono } from "hono";
import { flue } from "@flue/runtime/routing";
import { getStores } from "./shared/stores.ts";
import { RESEARCH_PUBLISHER_AGENT } from "./shared/instance-id.ts";

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

// --- Application-owned approval surface (handoff §17) ---------------------
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
    return c.json({ error: "decision must be 'approved' or 'denied'" }, 400);
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

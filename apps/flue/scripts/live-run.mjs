// Throwaway live-run driver for the Flue baseline end-to-end loop.
// Drives turns via the SDK client's agents.prompt (terminal result + usage) and
// inspects the materialized conversation via the @demo/flue-adapter normalizer.
//
// Usage: node scripts/live-run.mjs <command> [threadId]
//   commands: turn1 | status | approve | turn2 | events | resume
import { createFlueClient } from "@flue/sdk";
import { createFlueAdapter } from "../../../packages/flue-adapter/src/index.ts";

const BASE = "http://localhost:3002";
const AGENT = "research-publisher";
const threadId = process.argv[3] ?? "live-thread-1";

const client = createFlueClient({ baseUrl: BASE });
const adapter = createFlueAdapter({ baseUrl: BASE });

function toInstance(t) {
  return t.replace(/[^A-Za-z0-9_-]/g, (ch) =>
    `~${ch.codePointAt(0).toString(16).padStart(2, "0")}`,
  );
}
const instanceId = toInstance(threadId);

async function prompt(message) {
  const t0 = Date.now();
  const res = await client.agents.prompt(AGENT, instanceId, { message });
  const ms = Date.now() - t0;
  console.log("=== PROMPT RESULT (%dms) ===", ms);
  console.log("model:", JSON.stringify(res.result?.model));
  console.log("usage:", JSON.stringify(res.result?.usage));
  console.log("text:\n" + res.result?.text);
  return res;
}

async function dumpEvents() {
  const { events } = await adapter.getThread(threadId);
  console.log("=== NORMALIZED EVENTS (%d) ===", events.length);
  for (const e of events) {
    if (e.type === "message") {
      console.log(`[msg:${e.role}] ${String(e.text).slice(0, 200)}`);
    } else if (e.type === "tool-call") {
      console.log(`[tool-call] ${e.toolName} ${JSON.stringify(e.input).slice(0, 300)}`);
    } else if (e.type === "tool-result") {
      console.log(`[tool-result] ${e.toolName} ${JSON.stringify(e.output).slice(0, 300)}`);
    } else if (e.type === "error") {
      console.log(`[error] ${e.message}`);
    } else {
      console.log(`[${e.type}] ${JSON.stringify(e).slice(0, 200)}`);
    }
  }
}

async function dumpRawHistory() {
  const snap = await client.agents.history(AGENT, instanceId);
  console.log("=== RAW HISTORY MESSAGES ===");
  console.log(JSON.stringify(snap.messages, null, 1).slice(0, 6000));
}

const cmd = process.argv[2];
if (cmd === "turn1") {
  await prompt("How does durable execution survive a restart?");
  await dumpEvents();
} else if (cmd === "turn2") {
  await prompt("The proposal has been approved. Please proceed to publish it and report the receipt.");
  await dumpEvents();
} else if (cmd === "resume") {
  await prompt("Remind me: what topic did you research, and what was the title of the artifact you published?");
} else if (cmd === "events") {
  await dumpEvents();
} else if (cmd === "raw") {
  await dumpRawHistory();
} else {
  console.log("unknown command");
}

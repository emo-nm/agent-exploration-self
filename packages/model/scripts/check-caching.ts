// Provider-level proof that @demo/model's prompt-caching wrapper actually makes
// OpenRouter/Anthropic cache the prompt. Costs money (two real model calls), so
// it is wired as `pnpm check:caching`, NOT part of the default test run.
//
// It makes two consecutive generateText calls that share a large system prefix.
// Call 1 seeds the cache (expect cacheWrite > 0). Call 2 reuses it (expect
// cacheRead > 0). Asserts the second call shows cache-read tokens > 0.
//
// Requires OPENROUTER_API_KEY and DEMO_MODEL_ID. Loads them from the repo-root
// .env if present (never prints the key).

import { readFileSync } from "node:fs";
import { generateText } from "ai";
import { createCachingModel, type CacheUsage } from "../src/index.js";

// Minimal .env loader (avoid a dependency). Search a few likely roots.
function loadEnv(): void {
  const candidates = [
    process.env.DEMO_ENV_PATH,
    new URL("../../../.env", import.meta.url).pathname,
    "/Users/emo-nm/conductor/workspaces/agent-exploration/abu-dhabi/.env",
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1]!;
        let val = m[2]!;
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
      return;
    } catch {
      // try next
    }
  }
}

// A big, stable system prefix so there is enough to cache (Anthropic requires a
// minimum cacheable token count; pad well past it).
const SYSTEM_PREFIX =
  "You are a meticulous research assistant for a durable-execution evaluation. " +
  "Follow these standing instructions on every request. " +
  Array.from(
    { length: 220 },
    (_, i) =>
      `Rule ${i + 1}: always ground claims in provided evidence, cite the source id, ` +
      `never fabricate corpus documents, and prefer the most specific matching passage.`,
  ).join(" ");

async function main() {
  loadEnv();
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");

  const usages: CacheUsage[] = [];
  const model = createCachingModel({ onUsage: (u) => usages.push(u) });

  const call = async (label: string) => {
    const res = await generateText({
      model: model as never,
      system: SYSTEM_PREFIX,
      messages: [
        { role: "user", content: "In one sentence: what does durable execution guarantee across a restart?" },
      ],
    });
    const u = usages[usages.length - 1]!;
    console.log(
      `${label}: input=${u.inputTokens ?? "?"} cacheRead=${u.cacheReadTokens ?? 0} ` +
        `cacheWrite=${u.cacheWriteTokens ?? 0} output=${u.outputTokens ?? "?"}`,
    );
    console.log(`  reply: ${res.text.slice(0, 120)}`);
    return u;
  };

  console.log("Model:", process.env.DEMO_MODEL_ID ?? "anthropic/claude-sonnet-5");
  console.log(`System prefix length: ~${Math.round(SYSTEM_PREFIX.length / 4)} tokens (approx)`);

  const first = await call("call 1 (seed)");
  // Small delay so the cache write settles.
  await new Promise((r) => setTimeout(r, 1500));
  const second = await call("call 2 (reuse)");

  const cacheRead = second.cacheReadTokens ?? 0;
  const seeded = (first.cacheWriteTokens ?? 0) > 0 || (first.cacheReadTokens ?? 0) > 0;

  console.log("---");
  console.log(`seeded on call 1: ${seeded}`);
  console.log(`cacheRead on call 2: ${cacheRead}`);

  if (cacheRead <= 0) {
    console.error("FAIL: second call showed no cache-read tokens — caching is NOT working.");
    process.exit(1);
  }
  console.log("PASS: prompt caching is active (call 2 read cached tokens).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

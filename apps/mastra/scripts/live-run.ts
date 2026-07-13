// THROWAWAY live-run driver for the Mastra baseline. Drives the agent through
// the @demo/mastra-adapter and prints normalized AgentEvents. A RAW=1 mode dumps
// the raw SSE lines so we can verify/repair the normalizer against a live stream.
//
// Usage:
//   node scripts/live-run.ts "<message>" [threadId] [resourceId]
//   RAW=1 node scripts/live-run.ts "<message>" [threadId] [resourceId]
import { MastraAdapter } from '../../../packages/mastra-adapter/src/index.ts';

const baseUrl = process.env.MASTRA_URL ?? 'http://localhost:3003';
const agentId = process.env.AGENT_ID ?? 'research-publisher';
const message = process.argv[2] ?? 'How does durable execution survive a restart?';
const threadId = process.argv[3] ?? `thr_live_${Date.now().toString(36)}`;
const resourceId = process.argv[4] ?? 'user_live';

async function rawDump() {
  const res = await fetch(`${baseUrl}/api/agents/${agentId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      memory: { thread: threadId, resource: resourceId },
    }),
  });
  console.error(`[raw] status=${res.status} ct=${res.headers.get('content-type')}`);
  if (!res.body) {
    console.error('[raw] no body:', await res.text());
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(dec.decode(value, { stream: true }));
  }
  console.log('\n[raw] --- stream end ---');
}

async function viaAdapter() {
  const adapter = new MastraAdapter({ baseUrl, agentId });
  const health = await adapter.health().catch((e) => ({ error: String(e) }));
  console.log('[health]', JSON.stringify(health));
  const handle = { threadId, resourceId };
  console.log('[thread]', JSON.stringify(handle));
  console.log('[send]', message);
  let n = 0;
  for await (const ev of adapter.streamEvents(handle, message)) {
    n++;
    const { raw, ...rest } = ev as Record<string, unknown>;
    console.log(`[ev ${n}]`, JSON.stringify(rest));
  }
  console.log(`[done] ${n} normalized events`);
}

(process.env.RAW === '1' ? rawDump() : viaAdapter()).catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

// Unit tests for the pure normalizer + a fetch-stubbed health check. No live
// Mastra server or API keys required.
import { describe, it, expect } from 'vitest';
import { normalizeMastraChunk, MastraAdapter } from './index';

describe('normalizeMastraChunk', () => {
  it('maps text chunks to message events with raw passthrough', () => {
    const ev = normalizeMastraChunk({ type: 'text', payload: { text: 'hello' } });
    expect(ev).toMatchObject({ type: 'message', role: 'assistant', text: 'hello' });
    expect(ev?.raw).toEqual({ type: 'text', payload: { text: 'hello' } });
  });

  it('maps tool-call and tool-result', () => {
    const call = normalizeMastraChunk({
      type: 'tool-call',
      payload: { toolName: 'search_fixture_corpus', toolCallId: 'c1', args: { query: 'x' } },
    });
    expect(call).toMatchObject({ type: 'tool-call', toolName: 'search_fixture_corpus', callId: 'c1' });
    const result = normalizeMastraChunk({
      type: 'tool-result',
      payload: { toolName: 'publish_artifact', toolCallId: 'c2', result: { ok: true } },
    });
    expect(result).toMatchObject({ type: 'tool-result', callId: 'c2' });
  });

  it('maps suspend/approval chunks to approval-pending', () => {
    const ev = normalizeMastraChunk({
      type: 'tool-execution-suspended',
      payload: { proposalId: 'prop_1' },
    });
    expect(ev).toMatchObject({ type: 'approval-pending', proposalId: 'prop_1' });
  });

  it('maps a finish chunk to a usage event (AI-SDK usage vocabulary)', () => {
    const ev = normalizeMastraChunk({
      type: 'finish',
      payload: {
        output: {
          usage: {
            inputTokens: 200,
            outputTokens: 80,
            totalTokens: 280,
            cachedInputTokens: 20,
            cacheCreationInputTokens: 12,
          },
        },
      },
    });
    expect(ev).toMatchObject({
      type: 'usage',
      inputTokens: 200,
      outputTokens: 80,
      cacheReadTokens: 20,
      cacheWriteTokens: 12,
      totalTokens: 280,
      costUsd: 0,
    });
  });

  it('maps step-finish totalUsage and treats a usage-less finish as noise', () => {
    const step = normalizeMastraChunk({
      type: 'step-finish',
      payload: { totalUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
    });
    expect(step).toMatchObject({ type: 'usage', inputTokens: 5, outputTokens: 3, totalTokens: 8 });
    expect(normalizeMastraChunk({ type: 'finish', payload: { output: {} } })).toBeNull();
  });

  it('returns null for lifecycle noise', () => {
    expect(normalizeMastraChunk({ type: 'step-start' })).toBeNull();
    expect(normalizeMastraChunk({ type: 'text', payload: { text: '' } })).toBeNull();
  });
});

describe('MastraAdapter.health', () => {
  it('calls /health and returns the parsed body', async () => {
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toBe('http://localhost:3003/health');
      return new Response(JSON.stringify({ status: 'ok', backend: 'mastra' }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const adapter = new MastraAdapter({ baseUrl: 'http://localhost:3003/', fetchImpl });
    await expect(adapter.health()).resolves.toEqual({ status: 'ok', backend: 'mastra' });
  });
});

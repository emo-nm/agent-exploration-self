// Unit tests for the Mastra tool wrappers, exercised against the in-memory repo
// (no DB, no API keys). Verifies the contracts→domain→effects path and the
// application-owned approval gate + idempotent publish.
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDemoRepo } from '@demo/persistence';
import {
  searchFixtureCorpusImpl,
  createPublicationProposalImpl,
  getPublicationStatusImpl,
  publishArtifactImpl,
} from './research-tools';

let repo: InMemoryDemoRepo;
beforeEach(() => {
  repo = new InMemoryDemoRepo();
});

describe('searchFixtureCorpusImpl', () => {
  it('is deterministic and returns scored hits', () => {
    const a = searchFixtureCorpusImpl({ query: 'durable workflows' });
    const b = searchFixtureCorpusImpl({ query: 'durable workflows' });
    expect(a).toEqual(b);
    expect(a.query).toBe('durable workflows');
    expect(Array.isArray(a.hits)).toBe(true);
  });

  it('rejects empty queries via the contract schema', () => {
    expect(() => searchFixtureCorpusImpl({ query: '' })).toThrow();
  });
});

describe('proposal + approval + publish', () => {
  it('creates a pending proposal', async () => {
    const p = await createPublicationProposalImpl(repo, {
      threadId: 't1',
      title: 'T',
      body: 'B',
    });
    expect(p.status).toBe('pending');
    const status = await getPublicationStatusImpl(repo, p.id);
    expect(status.status).toBe('pending');
  });

  it('refuses to publish a proposal that is not approved', async () => {
    const p = await createPublicationProposalImpl(repo, {
      threadId: null,
      title: 'T',
      body: 'B',
    });
    await expect(publishArtifactImpl(repo, { proposalId: p.id })).rejects.toThrow(
      /expected approved/,
    );
  });

  it('publishes once approved and is idempotent on retry', async () => {
    const p = await createPublicationProposalImpl(repo, {
      threadId: null,
      title: 'T',
      body: 'B',
    });
    // Application-owned approval: an out-of-band actor flips the row.
    await repo.setProposalStatus(p.id, 'approved', new Date().toISOString());

    const first = await publishArtifactImpl(repo, { proposalId: p.id });
    expect(first.receipt.created).toBe(true);
    expect((await getPublicationStatusImpl(repo, p.id)).status).toBe('published');

    // Retry with the same (defaulted) idempotency key → same receipt, no dupe.
    const second = await publishArtifactImpl(repo, { proposalId: p.id });
    expect(second.receipt.created).toBe(false);
    expect(second.receipt.publicationId).toBe(first.receipt.publicationId);
  });

  it('reports unknown for a missing proposal', async () => {
    expect((await getPublicationStatusImpl(repo, 'nope')).status).toBe('unknown');
  });
});

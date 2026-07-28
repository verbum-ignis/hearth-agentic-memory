import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRecallCandidates, recallByEmbedding } from '../../packages/recall/src/recall.js';

const asOf = new Date('2026-07-27T00:00:00.000Z');

function candidate(id, overrides = {}) {
  return {
    id,
    language: 'en',
    type: 'event',
    hook: id,
    sealed: false,
    anchor: 0,
    tier_since: null,
    last_accessed: '2026-07-26T00:00:00.000Z',
    status: 'active',
    trigger_date: null,
    trigger_done: false,
    embedding_status: 'ready',
    distance: 0.2,
    ...overrides,
  };
}

test('post-ANN filtering removes every ineligible and excluded candidate before top-k', () => {
  const rows = [
    candidate('sealed', { sealed: true, distance: 0.01 }),
    candidate('retired', { status: 'retired', distance: 0.02 }),
    candidate('rule', { type: 'rule', distance: 0.03 }),
    candidate('deep', { type: 'stream', last_accessed: '2026-07-01T00:00:00.000Z', distance: 0.04 }),
    candidate('excluded', { distance: 0.05 }),
    candidate('not-ready', { embedding_status: 'pending', distance: 0.06 }),
    candidate('eligible-a', { distance: 0.1 }),
    candidate('eligible-b', { distance: 0.25 }),
  ];
  const result = filterRecallCandidates(rows, {
    asOf,
    excludeIds: ['excluded'],
    threshold: 0.8,
    topK: 3,
  });
  assert.deepEqual(result.map((item) => item.id), ['eligible-a']);
  assert.equal(result[0].score, 0.9);
});

test('ANN SQL has only the scope predicate and forces the vector index', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [candidate('eligible')] };
    },
  };
  const result = await recallByEmbedding(pool, '[1,0]', { scopeId: 'scope-a', oversample: 20 });
  assert.deepEqual(result.map((item) => item.id), ['eligible']);
  assert.match(captured.sql, /FORCE_INDEX=hearth_entries_scope_embedding_idx/u);
  assert.match(captured.sql, /WHERE scope_id = \$1\s+ORDER BY/u);
  assert.doesNotMatch(captured.sql, /WHERE[\s\S]*(sealed|status|embedding_status)\s*=/u);
  assert.deepEqual(captured.params, ['scope-a', '[1,0]', 20]);
});

test('session overlay is applied after ANN and before lifecycle filtering', async () => {
  let call = 0;
  const pool = {
    async query() {
      call += 1;
      if (call === 1) {
        return { rows: [candidate('revived', {
          type: 'stream',
          last_accessed: '2026-06-01T00:00:00.000Z',
        })] };
      }
      return { rows: [{
        entry_id: 'revived',
        effective_last_accessed: '2026-07-26T00:00:00.000Z',
        effective_anchor: 0,
        effective_tier_since: null,
      }] };
    },
  };
  const result = await recallByEmbedding(pool, '[1,0]', {
    scopeId: 'demo_public', sessionIdHash: 'session-hash', asOf, oversample: 20,
  });
  assert.deepEqual(result.map((item) => item.id), ['revived']);
  assert.equal(call, 2);
});

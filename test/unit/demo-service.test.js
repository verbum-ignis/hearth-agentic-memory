import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoService, validateMemoryInput } from '../../apps/server/src/demo-service.js';

test('demo save accepts only bounded, non-rule fictional memory fields', () => {
  assert.deepEqual(validateMemoryInput({
    hook: ' A save point ', body: ' The story continues. ', keys: ['Hearth', 'Hearth', 'continuity'],
  }), {
    hook: 'A save point', body: 'The story continues.', keys: ['Hearth', 'continuity'], type: 'event', language: 'en',
  });
  assert.throws(() => validateMemoryInput({ hook: 'x', body: 'y', type: 'rule' }), /type/u);
  assert.throws(() => validateMemoryInput({ hook: 'x', body: 'y', language: 'fr' }), /language/u);
  assert.throws(() => validateMemoryInput({ hook: 'x', body: 'y', keys: Array.from({ length: 11 }, (_, index) => `key-${index}`) }), /keys/u);
});

test('constellation distinguishes the archived baseline from a session touch', async () => {
  const pool = {
    async query() {
      return {
        rows: [{
          id: 'touched-demo',
          scope_id: 'demo_public',
          language: 'en',
          type: 'event',
          hook: 'A distant memory',
          status: 'active',
          sealed: false,
          baseline_last_accessed: '2025-01-01T00:00:00.000Z',
          anchor: 0,
          tier_since: null,
          last_accessed: new Date().toISOString(),
          touched_in_session: true,
          embedding_status: 'ready',
        }],
      };
    },
  };
  const memories = await createDemoService(pool).constellation({
    session_id_hash: 'session-hash',
    scope_id: 'session-scope',
  });
  assert.equal(memories[0].baseline_band, 'deep');
  assert.equal(memories[0].band, 'active');
  assert.equal(memories[0].scope, 'demo');
  assert.equal(memories[0].touched_in_session, true);
});

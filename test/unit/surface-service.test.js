import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSurfaceCandidates } from '../../apps/server/src/surface-service.js';

test('surface union is deterministic, deduplicated and keys-first', () => {
  const keys = [
    { id: 'key-only', hook: 'key' },
    { id: 'both', hook: 'both from keys' },
  ];
  const semantic = [
    { id: 'semantic-only', hook: 'semantic', score: 0.9 },
    { id: 'both', hook: 'both from semantic', score: 0.8 },
  ];
  assert.deepEqual(mergeSurfaceCandidates(keys, semantic, 5), [
    { id: 'key-only', hook: 'key', channels: ['keys'] },
    { id: 'both', hook: 'both from keys', channels: ['keys', 'semantic'] },
    { id: 'semantic-only', hook: 'semantic', score: 0.9, channels: ['semantic'] },
  ]);
});

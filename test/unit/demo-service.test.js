import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMemoryInput } from '../../apps/server/src/demo-service.js';

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

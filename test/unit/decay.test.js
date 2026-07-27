import assert from 'node:assert/strict';
import test from 'node:test';
import { bandForEntry, isRecallEligible } from '../../packages/core/src/decay.js';

const asOf = new Date('2026-07-27T00:00:00Z');

function entry(overrides = {}) {
  return {
    type: 'event',
    tier: 0,
    status: 'active',
    sealed: false,
    last_accessed: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

test('uses exact stream and event decay boundaries', () => {
  assert.equal(bandForEntry(entry({ type: 'stream', last_accessed: '2026-07-20T00:00:01Z' }), asOf), 'active');
  assert.equal(bandForEntry(entry({ type: 'stream', last_accessed: '2026-07-20T00:00:00Z' }), asOf), 'half_sunk');
  assert.equal(bandForEntry(entry({ type: 'stream', last_accessed: '2026-07-13T00:00:00Z' }), asOf), 'half_sunk');
  assert.equal(bandForEntry(entry({ type: 'stream', last_accessed: '2026-07-12T23:59:59Z' }), asOf), 'deep');
  assert.equal(bandForEntry(entry({ last_accessed: '2026-03-01T00:00:00Z' }), asOf), 'deep');
});

test('applies tier multipliers and anchor exemption', () => {
  assert.equal(bandForEntry(entry({ tier: 1, last_accessed: '2026-04-01T00:00:00Z' }), asOf), 'glimmer');
  assert.equal(bandForEntry(entry({ tier: 2, last_accessed: '2026-03-01T00:00:00Z' }), asOf), 'beacon');
  assert.equal(bandForEntry(entry({ tier: 3, last_accessed: '2020-01-01T00:00:00Z' }), asOf), 'anchor');
});

test('excludes sealed, non-active, rule and deep entries upstream', () => {
  assert.equal(isRecallEligible(entry(), asOf), true);
  assert.equal(isRecallEligible(entry({ sealed: true }), asOf), false);
  assert.equal(isRecallEligible(entry({ status: 'superseded' }), asOf), false);
  assert.equal(isRecallEligible(entry({ type: 'rule' }), asOf), false);
  assert.equal(isRecallEligible(entry({ last_accessed: '2026-03-01T00:00:00Z' }), asOf), false);
});

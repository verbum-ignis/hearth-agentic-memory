import assert from 'node:assert/strict';
import test from 'node:test';
import { bandForEntry } from '../../packages/core/src/decay.js';
import { loadDemoData, validateDemoData } from '../../scripts/lib/demo-data.js';

test('five-entry sample satisfies the executable data contract', async () => {
  const document = await loadDemoData('data/demo-sample.json');
  const result = validateDemoData(document, { allowPartial: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('sealed leakage and time-derived band mismatches fail validation', async () => {
  const document = await loadDemoData('data/demo-sample.json');
  document.entries[3].expected_eligibility = true;
  document.entries[2].expected_band = 'active';
  const result = validateDemoData(document, { allowPartial: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /sealed entry cannot be eligible/u);
  assert.match(result.errors.join('\n'), /calculated=half_sunk/u);
});

test('an ineligible distractor cannot make negative retrieval pass for free', async () => {
  const document = await loadDemoData('data/demo-sample.json');
  document.entries[0].retrieval = 'distractor';
  document.entries[0].expected_eligibility = false;
  const result = validateDemoData(document, { allowPartial: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /distractor must remain recall-eligible/u);
});

test('v1 contains an active entry excluded only by the deep decay band', async () => {
  const document = await loadDemoData('data/demo-data-v1.json');
  const asOf = new Date(document.band_as_of);
  const probes = document.entries.filter((entry) => (
    entry.status === 'active'
    && !entry.sealed
    && entry.type !== 'rule'
    && bandForEntry(entry, asOf) === 'deep'
    && entry.expected_eligibility === false
  ));

  assert.deepEqual(probes.map((entry) => entry.id), ['demo_074']);
});

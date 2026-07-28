import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrateThreshold, scoreEvalCases } from '../../eval/lib/scoring.js';

const cases = [
  { id: 'positive', scored: 'retrieval', expected: ['right'], forbidden: [] },
  { id: 'negative', scored: 'retrieval', expected: [], forbidden: [] },
  { id: 'leakage', scored: 'leakage_only', expected: [], forbidden: ['secret'] },
];

test('scoring separates retrieval, no-hit and leakage-only contracts', () => {
  const report = scoreEvalCases(cases, {
    positive: [{ id: 'wrong', score: 0.9 }, { id: 'right', score: 0.8 }],
    negative: [{ id: 'neighbor', score: 0.4 }],
    leakage: [{ id: 'secret', score: 0.7 }],
  }, { threshold: 0.5 });
  assert.equal(report.hit1, 0);
  assert.equal(report.hit3, 1);
  assert.equal(report.mrr, 0.5);
  assert.equal(report.noHitAccuracy, 1);
  assert.equal(report.forbiddenViolationCount, 1);
});

test('calibration uses only supplied cases and enforces the no-hit floor', () => {
  const report = calibrateThreshold(cases.slice(0, 2), {
    positive: [{ id: 'right', score: 0.8 }],
    negative: [{ id: 'neighbor', score: 0.6 }],
  });
  assert.ok(report.threshold > 0.6);
  assert.ok(report.threshold <= 0.8);
  assert.equal(report.hit3, 1);
  assert.equal(report.noHitAccuracy, 1);
});

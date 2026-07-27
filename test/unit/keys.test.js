import assert from 'node:assert/strict';
import test from 'node:test';
import { keyMatchesInput, matchingKeys, normalizeForKeyMatch } from '../../packages/core/src/keys.js';

test('normalizes NFKC, case and whitespace without stripping accents', () => {
  assert.equal(normalizeForKeyMatch('  ＢＡＣＫＵＰ\tDrive  '), 'backup drive');
  assert.equal(normalizeForKeyMatch('CAFÉ'), 'café');
  assert.notEqual(normalizeForKeyMatch('CAFÉ'), normalizeForKeyMatch('CAFE'));
});

test('matches English phrases at Unicode-aware word boundaries', () => {
  assert.equal(keyMatchesInput('The BACKUP   drive clicked.', 'backup drive'), true);
  assert.equal(keyMatchesInput('A concatenated example', 'cat'), false);
  assert.equal(keyMatchesInput('cat-like reflexes', 'cat'), true);
  assert.equal(keyMatchesInput('élan and café', 'café'), true);
  assert.equal(keyMatchesInput('élan and cafe', 'café'), false);
});

test('matches Chinese and mixed-language keys by normalized substring', () => {
  assert.equal(keyMatchesInput('外婆今天终于出院了', '外婆'), true);
  assert.equal(keyMatchesInput('带 MISO 味噌 去复诊', 'Miso 味噌'), true);
  assert.equal(keyMatchesInput('味噌去复诊', 'Miso 味噌'), false);
});

test('returns only the matching keys and rejects invalid input', () => {
  assert.deepEqual(matchingKeys('Miso went to the 宠物医院', ['Miso', '外婆', '宠物医院']), [
    'Miso',
    '宠物医院',
  ]);
  assert.deepEqual(matchingKeys('anything', null), []);
  assert.equal(keyMatchesInput(null, 'anything'), false);
});

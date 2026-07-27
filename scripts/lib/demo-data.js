import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bandForEntry, isRecallEligible } from '../../packages/core/src/decay.js';

const ENUMS = {
  demo_group: new Set(['en', 'zh', 'cross']),
  language: new Set(['en', 'zh']),
  type: new Set(['rule', 'letter', 'event', 'project', 'stream']),
  status: new Set(['active', 'superseded', 'retired', 'archived']),
  retrieval: new Set(['easy', 'paraphrase', 'emotional', 'ambiguous', 'distractor']),
  relation: new Set(['unique', 'confusable', 'superseding']),
};

const REQUIRED = [
  'id', 'demo_group', 'language', 'eval_groups', 'type', 'tier', 'expected_band',
  'status', 'sealed', 'retrieval', 'relation', 'expected_eligibility', 'occurred_at',
  'created_at', 'updated_at', 'last_accessed', 'tier_since', 'hook', 'keys', 'body',
];

const FULL_QUOTAS = {
  demo_group: { en: 40, zh: 25, cross: 10 },
  type: { event: 30, stream: 20, letter: 10, project: 10, rule: 5 },
  tier: { 0: 50, 1: 12, 2: 8, 3: 5 },
  status: { active: 68, superseded: 4, retired: 3 },
  retrieval: { easy: 20, paraphrase: 20, emotional: 15, ambiguous: 10, distractor: 10 },
  relation: { unique: 55, confusable: 12, superseding: 8 },
};

function isDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function counts(entries, field) {
  return entries.reduce((result, entry) => {
    const key = String(entry[field]);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

export async function loadDemoData(path = 'data/demo-sample.json') {
  const fullPath = resolve(path);
  return JSON.parse(await readFile(fullPath, 'utf8'));
}

export function validateDemoData(document, { allowPartial = false } = {}) {
  const errors = [];
  if (document?.schema_version !== 'hearth-demo-v1') errors.push('schema_version must be hearth-demo-v1');
  if (!isDate(document?.band_as_of)) errors.push('band_as_of must be an explicit ISO timestamp');
  if (!Array.isArray(document?.entries)) return { ok: false, errors: [...errors, 'entries must be an array'] };

  const asOf = new Date(document.band_as_of);
  const ids = new Set();
  for (const [index, entry] of document.entries.entries()) {
    const label = entry?.id ?? `row ${index + 1}`;
    for (const field of REQUIRED) {
      if (!(field in (entry ?? {}))) errors.push(`${label}: missing ${field}`);
    }
    if (!/^demo_\d{3}$/u.test(entry.id ?? '')) errors.push(`${label}: invalid id`);
    if (ids.has(entry.id)) errors.push(`${label}: duplicate id`);
    ids.add(entry.id);
    for (const [field, values] of Object.entries(ENUMS)) {
      if (!values.has(entry[field])) errors.push(`${label}: invalid ${field}=${entry[field]}`);
    }
    if (!Number.isInteger(entry.tier) || entry.tier < 0 || entry.tier > 3) errors.push(`${label}: tier must be 0..3`);
    if (!Array.isArray(entry.eval_groups) || entry.eval_groups.length === 0) errors.push(`${label}: eval_groups required`);
    if (!Array.isArray(entry.keys) || entry.keys.some((key) => typeof key !== 'string' || !key.trim())) errors.push(`${label}: keys must be non-empty strings`);
    for (const field of ['occurred_at', 'created_at', 'updated_at', 'last_accessed']) {
      if (!isDate(entry[field])) errors.push(`${label}: ${field} must be an explicit timestamp`);
    }
    if (entry.tier > 0 && !isDate(entry.tier_since)) errors.push(`${label}: tier_since required for tier > 0`);
    if (entry.sealed && entry.expected_eligibility) errors.push(`${label}: sealed entry cannot be eligible`);
    if (entry.type === 'rule' && entry.expected_eligibility) errors.push(`${label}: rule cannot be recall-eligible`);
    const calculatedBand = bandForEntry(entry, asOf);
    if (entry.expected_band !== calculatedBand) {
      errors.push(`${label}: expected_band=${entry.expected_band}, calculated=${calculatedBand} at ${document.band_as_of}`);
    }
    const calculatedEligibility = isRecallEligible(entry, asOf);
    if (entry.expected_eligibility !== calculatedEligibility) {
      errors.push(`${label}: expected_eligibility=${entry.expected_eligibility}, calculated=${calculatedEligibility}`);
    }
  }

  for (const entry of document.entries) {
    if (entry.supersedes && !ids.has(entry.supersedes)) errors.push(`${entry.id}: missing supersedes target ${entry.supersedes}`);
  }

  if (!allowPartial) {
    if (document.entries.length !== 75) errors.push(`full dataset must contain 75 entries, got ${document.entries.length}`);
    for (const [field, quota] of Object.entries(FULL_QUOTAS)) {
      const actual = counts(document.entries, field);
      for (const [value, expected] of Object.entries(quota)) {
        if ((actual[value] ?? 0) !== expected) errors.push(`${field}.${value}: expected ${expected}, got ${actual[value] ?? 0}`);
      }
    }
    const sealedCount = document.entries.filter((entry) => entry.sealed).length;
    if (sealedCount !== 4) errors.push(`sealed: expected 4, got ${sealedCount}`);
  }

  return { ok: errors.length === 0, errors };
}

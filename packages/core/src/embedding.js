import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_SPEC_VERSION = 'hearth-v1';

export function canonicalEmbeddingText(entry) {
  const keys = Array.isArray(entry.keys) ? entry.keys.join(', ') : '';
  return [
    `Type: ${entry.type}`,
    `Hook: ${entry.hook}`,
    `Keys: ${keys}`,
    `Body: ${entry.body}`,
  ].join('\n').normalize('NFKC').replace(/[ \t]+/gu, ' ').trim();
}

export function canonicalQueryText(query) {
  if (typeof query !== 'string') throw new TypeError('Embedding query must be a string');
  const normalized = query.normalize('NFKC').replace(/[ \t]+/gu, ' ').trim();
  if (!normalized) throw new TypeError('Embedding query must not be empty');
  return normalized;
}

export function contentHash(entry) {
  return createHash('sha256').update(canonicalEmbeddingText(entry), 'utf8').digest('hex');
}

export function fixtureEmbedding(text, dimensions = EMBEDDING_DIMENSIONS) {
  const values = new Array(dimensions);
  let lengthSquared = 0;
  for (let i = 0; i < dimensions; i += 1) {
    const digest = createHash('sha256').update(`${i}:${text}`, 'utf8').digest();
    const raw = digest.readInt32BE(0) / 2_147_483_648;
    values[i] = raw;
    lengthSquared += raw * raw;
  }
  const norm = Math.sqrt(lengthSquared) || 1;
  return values.map((value) => value / norm);
}

export function vectorLiteral(values) {
  return `[${values.map((value) => Number(value).toFixed(9)).join(',')}]`;
}

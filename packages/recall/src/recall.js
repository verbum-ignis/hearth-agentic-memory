import { isRecallEligible } from '../../core/src/decay.js';
import { vectorLiteral } from '../../core/src/embedding.js';

export const DEFAULT_OVERSAMPLE = 20;

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}

export function filterRecallCandidates(rows, {
  asOf = new Date(),
  excludeIds = [],
  threshold = 0,
  topK = 3,
} = {}) {
  positiveInteger(topK, 'topK');
  if (!Number.isFinite(threshold)) throw new TypeError('threshold must be finite');
  const excluded = new Set(excludeIds);

  return rows
    .filter((row) => (
      row.embedding_status === 'ready'
      && !excluded.has(row.id)
      && isRecallEligible(row, asOf)
    ))
    .map((row) => ({
      id: row.id,
      score: 1 - Number(row.distance),
      language: row.language,
      type: row.type,
      hook: row.hook,
    }))
    .filter((row) => Number.isFinite(row.score) && row.score >= threshold)
    .slice(0, topK);
}

export async function recallByEmbedding(pool, embedding, {
  scopeId = 'demo_public',
  sessionIdHash = null,
  asOf = new Date(),
  excludeIds = [],
  threshold = 0,
  topK = 3,
  oversample = DEFAULT_OVERSAMPLE,
} = {}) {
  positiveInteger(topK, 'topK');
  positiveInteger(oversample, 'oversample');
  if (oversample < topK) throw new TypeError('oversample must be greater than or equal to topK');
  if (typeof scopeId !== 'string' || !scopeId) throw new TypeError('scopeId must not be empty');

  const queryVector = Array.isArray(embedding) ? vectorLiteral(embedding) : embedding;
  if (typeof queryVector !== 'string' || !queryVector.startsWith('[')) {
    throw new TypeError('embedding must be a vector array or CockroachDB vector literal');
  }

  // Keep the ANN query restricted to the vector index prefix. Lifecycle and
  // privacy predicates are deliberately applied after oversampling because
  // extra ordinary WHERE predicates can make CockroachDB abandon the index.
  const result = await pool.query(`
    SELECT id, language, type, hook, sealed, anchor, tier_since, last_accessed,
           status, trigger_date, trigger_done, embedding_status,
           embedding <=> $2::VECTOR AS distance
    FROM hearth_entries@{FORCE_INDEX=hearth_entries_scope_embedding_idx}
    WHERE scope_id = $1
    ORDER BY embedding <=> $2::VECTOR
    LIMIT $3
  `, [scopeId, queryVector, oversample]);

  if (sessionIdHash && result.rows.length > 0) {
    const state = await pool.query(`
      SELECT entry_id, effective_last_accessed, effective_anchor, effective_tier_since
      FROM hearth_session_entry_state
      WHERE session_id_hash = $1 AND entry_id = ANY($2::STRING[])
    `, [sessionIdHash, result.rows.map((row) => row.id)]);
    const byId = new Map(state.rows.map((row) => [row.entry_id, row]));
    for (const row of result.rows) {
      const overlay = byId.get(row.id);
      if (!overlay) continue;
      row.last_accessed = overlay.effective_last_accessed;
      row.anchor = overlay.effective_anchor;
      row.tier_since = overlay.effective_tier_since;
    }
  }

  return filterRecallCandidates(result.rows, { asOf, excludeIds, threshold, topK });
}

import { randomUUID } from 'node:crypto';
import { isRecallEligible } from '../../../packages/core/src/decay.js';
import { matchingKeys } from '../../../packages/core/src/keys.js';
import { withTransaction } from '../../../packages/db/src/pool.js';
import { HttpError } from './errors.js';
import { consumeSessionQuota } from './quota.js';
import { sha256 } from './security.js';

function parseKeys(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

export async function findKeyCandidates(pool, session, text, { asOf = new Date() } = {}) {
  const result = await pool.query(`
    SELECT e.id, e.language, e.type, e.keys, e.hook, e.sealed, e.status,
           e.trigger_date, e.trigger_done,
           COALESCE(s.effective_anchor, e.anchor) AS anchor,
           COALESCE(s.effective_tier_since, e.tier_since) AS tier_since,
           COALESCE(s.effective_last_accessed, e.last_accessed) AS last_accessed
    FROM hearth_entries AS e
    LEFT JOIN hearth_session_entry_state AS s
      ON s.session_id_hash = $1 AND s.entry_id = e.id
    WHERE e.scope_id = ANY($2::STRING[])
  `, [session.session_id_hash, ['demo_public', session.scope_id]]);
  return result.rows
    .map((row) => ({ ...row, matchedKeys: matchingKeys(text, parseKeys(row.keys)) }))
    .filter((row) => row.matchedKeys.length > 0 && isRecallEligible(row, asOf))
    .sort((a, b) => b.matchedKeys.length - a.matchedKeys.length || a.id.localeCompare(b.id))
    .map(({ id, language, type, hook }) => ({ id, language, type, hook }));
}

export function mergeSurfaceCandidates(keyCandidates, semanticCandidates, topK) {
  const merged = new Map();
  for (const item of keyCandidates) merged.set(item.id, { ...item, channels: ['keys'] });
  for (const item of semanticCandidates) {
    const existing = merged.get(item.id);
    if (existing) existing.channels.push('semantic');
    else merged.set(item.id, { ...item, channels: ['semantic'] });
  }
  return [...merged.values()].slice(0, topK);
}

function semanticStatus(error) {
  if (error?.code === 'semantic_uncalibrated' || error?.code === 'semantic_config_mismatch') return 'uncalibrated';
  if (/timed out|timeout/iu.test(error?.message)) return 'timeout';
  return 'unavailable';
}

export function createSurfaceService(pool, recall, {
  surfaceLimit = Number(process.env.SESSION_SURFACE_LIMIT ?? 60),
  runTtlMs = Number(process.env.AGENT_RUN_TTL_MS ?? 10 * 60 * 1_000),
  semanticTimeoutMs = Number(process.env.SURFACE_SEMANTIC_TIMEOUT_MS ?? 800),
} = {}) {
  return async function surface(session, input) {
    await withTransaction(pool, (client) => consumeSessionQuota(client, session.session_id_hash, 'surface', surfaceLimit));
    const semanticWithDeadline = Promise.race([
      recall(session, input),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Semantic recall timed out after ${semanticTimeoutMs}ms`)), semanticTimeoutMs);
        timer.unref?.();
      }),
    ]);
    const [keysResult, semanticResult] = await Promise.allSettled([
      findKeyCandidates(pool, session, input.text),
      semanticWithDeadline,
    ]);
    if (keysResult.status === 'rejected' && semanticResult.status === 'rejected') {
      throw new HttpError(503, 'surface_unavailable', 'Memory surfacing is temporarily unavailable.');
    }
    const keys = keysResult.status === 'fulfilled' ? keysResult.value : [];
    const semantics = semanticResult.status === 'fulfilled' ? semanticResult.value.candidates : [];
    const candidates = mergeSurfaceCandidates(keys, semantics, input.topK);
    const status = semanticResult.status === 'fulfilled' ? 'ready' : semanticStatus(semanticResult.reason);
    const queryHash = semanticResult.status === 'fulfilled' ? semanticResult.value.queryHash : sha256(input.text);
    const idempotencyKey = randomUUID();
    const snapshot = candidates.map(({ id, channels, score }) => ({ id, channels, ...(score == null ? {} : { score }) }));
    const run = await pool.query(`
      INSERT INTO hearth_agent_runs
        (session_id_hash, query_hash, candidate_snapshot, idempotency_key, expires_at)
      VALUES ($1, $2, $3::JSONB, $4, $5)
      RETURNING run_id
    `, [session.session_id_hash, queryHash, JSON.stringify(snapshot), idempotencyKey, new Date(Date.now() + runTtlMs)]);
    return {
      memories: candidates.map(({ score: _score, ...item }) => item),
      run_id: run.rows[0].run_id,
      idempotency_key: idempotencyKey,
      semantic_status: status,
    };
  };
}

import { createHash } from 'node:crypto';
import { canonicalQueryText } from '../../../packages/core/src/embedding.js';
import { withTransaction } from '../../../packages/db/src/pool.js';
import { recallByEmbedding } from '../../../packages/recall/src/recall.js';
import { HttpError } from './errors.js';
import { consumeGlobalQuota, consumeSessionQuota } from './quota.js';

const CACHE_TTL_MS = 10 * 60 * 1_000;

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function readActiveRecallConfig(pool, provider) {
  const result = await pool.query(`
    SELECT config_version, embedding_provider, embedding_model,
           embedding_dimensions, embedding_normalize, document_input_type,
           query_input_type, semantic_threshold, settings
    FROM hearth_recall_config WHERE config_key = 'active'
  `);
  const config = result.rows[0];
  if (!config || config.semantic_threshold == null) {
    throw new HttpError(503, 'semantic_uncalibrated', 'Semantic recall is not calibrated.');
  }
  if (
    config.embedding_provider !== provider.name
    || config.embedding_model !== provider.model
    || Number(config.embedding_dimensions) !== provider.dimensions
    || config.embedding_normalize !== true
    || config.document_input_type !== provider.documentInputType
    || config.query_input_type !== provider.queryInputType
  ) {
    throw new HttpError(503, 'semantic_config_mismatch', 'Semantic recall configuration is unavailable.');
  }
  return config;
}

export function createRecallService(pool, provider, {
  sessionEmbeddingLimit = Number(process.env.SESSION_EMBEDDING_LIMIT ?? 30),
  globalEmbeddingLimit = Number(process.env.GLOBAL_EMBEDDING_LIMIT ?? 10_000),
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  return async function recall(session, { text, excludeIds = [], topK = 3 }) {
    const config = await readActiveRecallConfig(pool, provider);
    const canonicalText = canonicalQueryText(text);
    const queryHash = hash(canonicalText);
    const cacheKey = hash(`${config.config_version}\0${provider.model}\0${queryHash}`);
    const cached = await pool.query(`
      SELECT embedding FROM hearth_query_embedding_cache
      WHERE cache_key = $1 AND expires_at > current_timestamp()
    `, [cacheKey]);

    let embedding = cached.rows[0]?.embedding;
    if (!embedding) {
      await withTransaction(pool, async (client) => {
        await consumeSessionQuota(client, session.session_id_hash, 'embedding', sessionEmbeddingLimit);
        await consumeGlobalQuota(client, 'embedding', globalEmbeddingLimit);
      });
      const call = await pool.query(`
        INSERT INTO hearth_provider_calls
          (capability, session_id_hash, provider, model, request_hash, status)
        VALUES ('embedding', $1, $2, $3, $4, 'started') RETURNING call_id
      `, [session.session_id_hash, provider.name, provider.model, queryHash]);
      try {
        embedding = await provider.embedQuery(canonicalText);
        await pool.query(`UPDATE hearth_provider_calls SET status = 'succeeded' WHERE call_id = $1`, [call.rows[0].call_id]);
      } catch (error) {
        const status = /timed out|timeout/iu.test(error?.message) ? 'timeout' : 'failed';
        await pool.query(`UPDATE hearth_provider_calls SET status = $2 WHERE call_id = $1`, [call.rows[0].call_id, status]).catch(() => {});
        throw error;
      }
      await pool.query(`
        UPSERT INTO hearth_query_embedding_cache
          (cache_key, embedding_model, embedding_spec_version, query_hash, embedding, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5::VECTOR, current_timestamp(), $6)
      `, [cacheKey, provider.model, provider.specVersion, queryHash, embedding, new Date(Date.now() + cacheTtlMs)]);
    }

    const options = {
      sessionIdHash: session.session_id_hash,
      excludeIds,
      threshold: Number(config.semantic_threshold),
      topK,
    };
    const [publicHits, privateHits] = await Promise.all([
      recallByEmbedding(pool, embedding, { ...options, scopeId: 'demo_public' }),
      recallByEmbedding(pool, embedding, { ...options, scopeId: session.scope_id }),
    ]);
    const merged = [...publicHits, ...privateHits]
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, topK);
    return { candidates: merged, queryHash, cacheHit: Boolean(cached.rows[0]) };
  };
}

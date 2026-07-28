import { createPool } from '../packages/db/src/pool.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_SPEC_VERSION } from '../packages/core/src/embedding.js';

const threshold = Number(process.env.SEMANTIC_THRESHOLD);
if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
  throw new Error('SEMANTIC_THRESHOLD must be a cosine-similarity value between -1 and 1');
}

const provider = process.env.EMBEDDING_PROVIDER ?? 'jina';
const model = process.env.EMBEDDING_MODEL_ID ?? 'jina-embeddings-v3';
const evalVersion = process.env.HEARTH_EVAL_VERSION ?? '1.1.0';
const pool = createPool({ applicationName: 'hearth-recall-config' });

try {
  const result = await pool.query(`
    UPSERT INTO hearth_recall_config (
      config_key, config_version, embedding_provider, embedding_model,
      embedding_dimensions, embedding_normalize, document_input_type,
      query_input_type, semantic_threshold, settings, updated_at
    ) VALUES (
      'active', $1, $2, $3, $4, true, 'retrieval.passage',
      'retrieval.query', $5, $6::JSONB, current_timestamp()
    )
    RETURNING config_key, config_version, embedding_provider, embedding_model,
              embedding_dimensions, embedding_normalize, document_input_type,
              query_input_type, semantic_threshold, updated_at
  `, [
    `${EMBEDDING_SPEC_VERSION}-jina-eval-${evalVersion}`,
    provider,
    model,
    EMBEDDING_DIMENSIONS,
    threshold,
    JSON.stringify({
      distance: 'cosine',
      oversample: 20,
      topK: 3,
      thresholdCalibratedOn: `HearthEval ${evalVersion} train`,
      validationDoesNotRetune: true,
    }),
  ]);
  process.stdout.write(`${JSON.stringify(result.rows[0])}\n`);
} finally {
  await pool.end();
}

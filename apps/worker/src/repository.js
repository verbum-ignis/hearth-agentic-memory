import { randomUUID } from 'node:crypto';
import { withTransaction } from '../../../packages/db/src/pool.js';

const CLAIMABLE = `
  sealed = false
  AND status = 'active'
  AND type IN ('event', 'project', 'letter', 'stream')
  AND embedding_attempts < $4
  AND ($5::STRING IS NULL OR scope_id = $5)
  AND (
    (embedding_status IN ('pending', 'failed')
      AND (embedding_next_retry_at IS NULL OR embedding_next_retry_at <= $1))
    OR
    (embedding_status = 'processing' AND embedding_claimed_at < $2)
  )
`;

export async function claimNext(pool, {
  now = new Date(),
  leaseMs = 60_000,
  maxAttempts = 5,
  scopeId = null,
} = {}) {
  const leaseCutoff = new Date(now.getTime() - leaseMs);
  const claimToken = randomUUID();

  return withTransaction(pool, async (client) => {
    const result = await client.query(`
      UPDATE hearth_entries
      SET embedding_status = 'processing',
          embedding_claimed_at = $1,
          embedding_claim_token = $3,
          embedding_attempts = embedding_attempts + 1,
          embedding_next_retry_at = NULL,
          embedding_error = NULL
      WHERE id = (
        SELECT id
        FROM hearth_entries
        WHERE ${CLAIMABLE}
        ORDER BY COALESCE(embedding_next_retry_at, created_at), id
        LIMIT 1
      )
      AND ${CLAIMABLE}
      RETURNING id, scope_id, type, keys, hook, body, content_hash,
                embedding_attempts, embedding_claim_token
    `, [now, leaseCutoff, claimToken, maxAttempts, scopeId]);
    const job = result.rows[0];
    return job ? { ...job, embedding_attempts: Number(job.embedding_attempts) } : null;
  });
}

export async function completeClaim(pool, job, {
  embedding,
  model,
  specVersion,
  now = new Date(),
}) {
  const result = await pool.query(`
    UPDATE hearth_entries
    SET embedding = $4::VECTOR,
        embedding_model = $5,
        embedding_spec_version = $6,
        embedding_status = 'ready',
        embedding_updated_at = $7,
        embedding_error = NULL,
        embedding_claimed_at = NULL,
        embedding_claim_token = NULL,
        embedding_next_retry_at = NULL
    WHERE id = $1
      AND embedding_status = 'processing'
      AND embedding_claim_token = $2
      AND content_hash = $3
      AND sealed = false
      AND status = 'active'
      AND type IN ('event', 'project', 'letter', 'stream')
    RETURNING id
  `, [job.id, job.embedding_claim_token, job.content_hash, embedding, model, specVersion, now]);
  return result.rowCount === 1 ? { status: 'ready', id: job.id } : { status: 'stale', id: job.id };
}

export function retryDelayMs(attempt) {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export async function failClaim(pool, job, error, { now = new Date(), maxAttempts = 5 } = {}) {
  const terminal = job.embedding_attempts >= maxAttempts;
  const nextRetry = terminal ? null : new Date(now.getTime() + retryDelayMs(job.embedding_attempts));
  const result = await pool.query(`
    UPDATE hearth_entries
    SET embedding_status = 'failed',
        embedding_error = $4,
        embedding_updated_at = $5,
        embedding_claimed_at = NULL,
        embedding_claim_token = NULL,
        embedding_next_retry_at = $6
    WHERE id = $1
      AND embedding_status = 'processing'
      AND embedding_claim_token = $2
      AND content_hash = $3
    RETURNING id
  `, [
    job.id,
    job.embedding_claim_token,
    job.content_hash,
    String(error?.message ?? error).slice(0, 500),
    now,
    nextRetry,
  ]);
  return result.rowCount === 1
    ? { status: terminal ? 'failed_terminal' : 'failed_retryable', id: job.id, nextRetry }
    : { status: 'stale', id: job.id };
}

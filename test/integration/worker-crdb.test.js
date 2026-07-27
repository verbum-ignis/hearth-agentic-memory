import assert from 'node:assert/strict';
import test from 'node:test';
import { contentHash } from '../../packages/core/src/embedding.js';
import { createPool } from '../../packages/db/src/pool.js';
import { claimNext, completeClaim } from '../../apps/worker/src/repository.js';
import { fixtureProvider } from '../../apps/worker/src/providers/fixture.js';

const enabled = process.env.HEARTH_INTEGRATION === '1';

function pendingEntry(id, overrides = {}) {
  const entry = {
    id,
    type: 'event',
    keys: ['fixture'],
    hook: `Fixture ${id}`,
    body: `Body for ${id}`,
    ...overrides,
  };
  return { ...entry, content_hash: contentHash(entry) };
}

async function insertPending(pool, entry, overrides = {}) {
  await pool.query(`
    INSERT INTO hearth_entries (
      id, scope_id, language, type, keys, hook, body, sealed, anchor,
      tier_since, last_accessed, status, created_at, updated_at, content_hash,
      embedding_status, embedding_attempts, embedding_claimed_at,
      embedding_claim_token, embedding_next_retry_at
    ) VALUES (
      $1, 'integration_worker', 'en', $2, $3::JSONB, $4, $5, false, 0,
      NULL, current_timestamp(), 'active', current_timestamp(), current_timestamp(), $6,
      $7, $8, $9, $10, $11
    )
  `, [
    entry.id,
    entry.type,
    JSON.stringify(entry.keys),
    entry.hook,
    entry.body,
    entry.content_hash,
    overrides.embedding_status ?? 'pending',
    overrides.embedding_attempts ?? 0,
    overrides.embedding_claimed_at ?? null,
    overrides.embedding_claim_token ?? null,
    overrides.embedding_next_retry_at ?? null,
  ]);
}

test('two workers never commit the same claim', { skip: !enabled }, async () => {
  const pool = createPool({ applicationName: 'hearth-worker-concurrency-test' });
  try {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`);
    await insertPending(pool, pendingEntry('worker_parallel_a'));
    await insertPending(pool, pendingEntry('worker_parallel_b'));
    const [a, b] = await Promise.all([
      claimNext(pool, { scopeId: 'integration_worker' }),
      claimNext(pool, { scopeId: 'integration_worker' }),
    ]);
    assert.ok(a);
    assert.ok(b);
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.embedding_claim_token, b.embedding_claim_token);
  } finally {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`).catch(() => {});
    await pool.end();
  }
});

test('an expired processing lease is reclaimed', { skip: !enabled }, async () => {
  const pool = createPool({ applicationName: 'hearth-worker-lease-test' });
  try {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`);
    const oldClaimedAt = new Date(Date.now() - 10 * 60_000);
    await insertPending(pool, pendingEntry('worker_expired_lease'), {
      embedding_status: 'processing',
      embedding_attempts: 1,
      embedding_claimed_at: oldClaimedAt,
      embedding_claim_token: 'abandoned-token',
    });
    const reclaimed = await claimNext(pool, { leaseMs: 60_000, scopeId: 'integration_worker' });
    assert.equal(reclaimed.id, 'worker_expired_lease');
    assert.equal(reclaimed.embedding_attempts, 2);
    assert.notEqual(reclaimed.embedding_claim_token, 'abandoned-token');
  } finally {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`).catch(() => {});
    await pool.end();
  }
});

test('a stale embedding cannot overwrite changed content', { skip: !enabled }, async () => {
  const pool = createPool({ applicationName: 'hearth-worker-stale-test' });
  try {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`);
    await insertPending(pool, pendingEntry('worker_stale_content'));
    const claimed = await claimNext(pool, { scopeId: 'integration_worker' });
    await pool.query(`
      UPDATE hearth_entries
      SET body = 'Body changed while provider was running',
          content_hash = 'new-content-hash',
          embedding_status = 'pending',
          embedding_claimed_at = NULL,
          embedding_claim_token = NULL
      WHERE id = $1
    `, [claimed.id]);
    const vector = await fixtureProvider.embed(claimed);
    const completed = await completeClaim(pool, claimed, {
      embedding: vector,
      model: fixtureProvider.model,
      specVersion: fixtureProvider.specVersion,
    });
    assert.equal(completed.status, 'stale');
    const row = await pool.query(`SELECT embedding, embedding_status FROM hearth_entries WHERE id = $1`, [claimed.id]);
    assert.equal(row.rows[0].embedding, null);
    assert.equal(row.rows[0].embedding_status, 'pending');
  } finally {
    await pool.query(`DELETE FROM hearth_entries WHERE scope_id = 'integration_worker'`).catch(() => {});
    await pool.end();
  }
});

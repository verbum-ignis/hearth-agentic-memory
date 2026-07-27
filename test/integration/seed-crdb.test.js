import assert from 'node:assert/strict';
import test from 'node:test';
import { createPool } from '../../packages/db/src/pool.js';

const enabled = process.env.HEARTH_INTEGRATION === '1';

test('sample seed preserves sealed upstream isolation', { skip: !enabled }, async () => {
  const pool = createPool({ applicationName: 'hearth-seed-contract-test' });
  try {
    const result = await pool.query(`
      SELECT id, sealed, embedding IS NULL AS embedding_is_null, embedding_status
      FROM hearth_entries
      WHERE id = 'demo_046'
    `);
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows[0], {
      id: 'demo_046',
      sealed: true,
      embedding_is_null: true,
      embedding_status: 'not_required',
    });
    const calls = await pool.query(`SELECT count(*)::INT AS count FROM hearth_provider_calls WHERE entry_id = 'demo_046'`);
    assert.equal(Number(calls.rows[0].count), 0);
  } finally {
    await pool.end();
  }
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createAgentChoiceService } from '../../apps/server/src/agent-choice-service.js';
import { createPool } from '../../packages/db/src/pool.js';

const enabled = process.env.HEARTH_INTEGRATION === '1';

test('CockroachDB atomically records choice, delivery and one session touch', { skip: !enabled }, async () => {
  const pool = createPool({ applicationName: 'hearth-agent-choice-test' });
  const suffix = randomUUID().replaceAll('-', '');
  const entryId = `choice_entry_${suffix}`;
  const session = {
    session_id_hash: `choice_session_${suffix}`,
    scope_id: `choice_scope_${suffix}`,
  };
  const idempotencyKey = randomUUID();
  let runId;
  try {
    await pool.query(`
      INSERT INTO hearth_demo_sessions
        (session_id_hash, scope_id, created_at, last_seen_at, expires_at)
      VALUES ($1, $2, current_timestamp(), current_timestamp(), current_timestamp() + INTERVAL '1 hour')
    `, [session.session_id_hash, session.scope_id]);
    await pool.query(`
      INSERT INTO hearth_entries (
        id, scope_id, language, type, keys, hook, body, sealed, anchor,
        tier_since, last_accessed, status, created_at, updated_at, content_hash,
        embedding_status
      ) VALUES (
        $1, $2, 'en', 'event', '[]', 'Integration hook', 'Integration body',
        false, 0, NULL, current_timestamp() - INTERVAL '80 days', 'active',
        current_timestamp(), current_timestamp(), 'integration-choice-hash', 'pending'
      )
    `, [entryId, session.scope_id]);
    const run = await pool.query(`
      INSERT INTO hearth_agent_runs
        (session_id_hash, query_hash, candidate_snapshot, idempotency_key, expires_at)
      VALUES ($1, 'query-hash', $2::JSONB, $3, current_timestamp() + INTERVAL '10 minutes')
      RETURNING run_id
    `, [session.session_id_hash, JSON.stringify([{ id: entryId, channels: ['keys'] }]), idempotencyKey]);
    runId = run.rows[0].run_id;

    const choose = createAgentChoiceService(pool);
    const input = { selectedIds: [entryId], idempotencyKey, reason: 'integration test' };
    const first = await choose(session, runId, input);
    const replay = await choose(session, runId, input);

    assert.equal(first.memories[0].body, 'Integration body');
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);

    const recorded = await pool.query(`
      SELECT
        (SELECT count(*)::INT FROM hearth_touch_log WHERE run_id = $1) AS touches,
        (SELECT count(*)::INT FROM hearth_session_entry_state
          WHERE session_id_hash = $2 AND entry_id = $3) AS overlays,
        (SELECT status FROM hearth_agent_runs WHERE run_id = $1) AS run_status
    `, [runId, session.session_id_hash, entryId]);
    assert.deepEqual({
      touches: Number(recorded.rows[0].touches),
      overlays: Number(recorded.rows[0].overlays),
      run_status: recorded.rows[0].run_status,
    }, { touches: 1, overlays: 1, run_status: 'completed' });
  } finally {
    await pool.query('DELETE FROM hearth_demo_sessions WHERE session_id_hash = $1', [session.session_id_hash]).catch(() => {});
    await pool.query('DELETE FROM hearth_entries WHERE id = $1', [entryId]).catch(() => {});
    await pool.end();
  }
});

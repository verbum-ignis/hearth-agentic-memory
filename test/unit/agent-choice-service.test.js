import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentChoiceService,
  validateAgentChoiceInput,
} from '../../apps/server/src/agent-choice-service.js';

const runId = '2162d6ad-a1c2-49ed-a608-8c9f73711e3b';
const session = { session_id_hash: 'session-hash', scope_id: 'session-scope' };

function fakePool() {
  const state = {
    run: {
      run_id: runId,
      candidate_snapshot: [
        { id: 'memory-a', channels: ['semantic'] },
        { id: 'memory-b', channels: ['keys'] },
      ],
      selected_ids: [],
      choice: null,
      status: 'surfaced',
      idempotency_key: 'choice-key',
      expires_at: new Date(Date.now() + 60_000),
    },
    entries: new Map([
      ['memory-a', {
        id: 'memory-a', scope_id: 'demo_public', language: 'en', type: 'event',
        hook: 'A hook', body: 'The selected body.', anchor: 1, tier_since: null,
      }],
      ['memory-b', {
        id: 'memory-b', scope_id: 'demo_public', language: 'en', type: 'letter',
        hook: 'B hook', body: 'The body that must stay closed.', anchor: 0, tier_since: null,
      }],
    ]),
    touches: [],
    overlays: [],
    commits: 0,
    rollbacks: 0,
  };
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { state.commits += 1; return {}; }
      if (sql === 'ROLLBACK') { state.rollbacks += 1; return {}; }
      if (/FROM hearth_agent_runs/u.test(sql) && /FOR UPDATE/u.test(sql)) {
        return params[0] === runId && params[1] === session.session_id_hash
          ? { rowCount: 1, rows: [{ ...state.run }] }
          : { rowCount: 0, rows: [] };
      }
      if (/FROM hearth_entries/u.test(sql)) {
        const rows = params[0].map((id) => state.entries.get(id)).filter(Boolean);
        return { rowCount: rows.length, rows };
      }
      if (/INSERT INTO hearth_session_entry_state/u.test(sql)) {
        state.overlays.push(params[1]);
        return {};
      }
      if (/INSERT INTO hearth_touch_log/u.test(sql)) {
        state.touches.push(params[0]);
        return {};
      }
      if (/UPDATE hearth_agent_runs/u.test(sql)) {
        state.run.status = 'completed';
        state.run.selected_ids = JSON.parse(params[2]);
        state.run.choice = params[3];
        return {};
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  return { state, connect: async () => client };
}

test('agent choice input rejects duplicate ids and bounds the reason', () => {
  assert.deepEqual(validateAgentChoiceInput({
    selected_ids: ['memory-a'],
    idempotency_key: ' key ',
    reason: ' relevant ',
  }), {
    selectedIds: ['memory-a'],
    idempotencyKey: 'key',
    reason: 'relevant',
  });
  assert.throws(() => validateAgentChoiceInput({
    selected_ids: ['memory-a', 'memory-a'], idempotency_key: 'key',
  }), /unique/u);
  assert.throws(() => validateAgentChoiceInput({
    selected_ids: [], idempotency_key: 'key', reason: 'x'.repeat(241),
  }), /240/u);
});

test('only a selected snapshot member is delivered and touched', async () => {
  const pool = fakePool();
  const choose = createAgentChoiceService(pool);
  const result = await choose(session, runId, {
    selectedIds: ['memory-a'], idempotencyKey: 'choice-key', reason: 'relevant',
  });
  assert.equal(result.choice, 'open');
  assert.deepEqual(result.selected_ids, ['memory-a']);
  assert.deepEqual(result.skipped_ids, ['memory-b']);
  assert.deepEqual(result.touched_ids, ['memory-a']);
  assert.equal(result.memories[0].body, 'The selected body.');
  assert.equal(result.memories.some((memory) => memory.id === 'memory-b'), false);
  assert.deepEqual(pool.state.touches, ['memory-a']);
  assert.deepEqual(pool.state.overlays, ['memory-a']);
  assert.equal(pool.state.run.status, 'completed');
  assert.equal(pool.state.commits, 1);
});

test('a completed run replays without touching twice', async () => {
  const pool = fakePool();
  const choose = createAgentChoiceService(pool);
  const input = { selectedIds: ['memory-a'], idempotencyKey: 'choice-key', reason: null };
  await choose(session, runId, input);
  const replay = await choose(session, runId, input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(pool.state.touches, ['memory-a']);
  assert.equal(pool.state.commits, 2);
});

test('an id outside the immutable snapshot is rejected atomically', async () => {
  const pool = fakePool();
  const choose = createAgentChoiceService(pool);
  await assert.rejects(
    choose(session, runId, {
      selectedIds: ['not-surfaced'], idempotencyKey: 'choice-key', reason: null,
    }),
    (error) => error.code === 'selection_not_surfaced',
  );
  assert.deepEqual(pool.state.touches, []);
  assert.equal(pool.state.rollbacks, 1);
});

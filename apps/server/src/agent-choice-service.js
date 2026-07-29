import { withTransaction } from '../../../packages/db/src/pool.js';
import { HttpError } from './errors.js';

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function validateAgentChoiceInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_request', 'A JSON object is required.');
  }
  const selectedIds = body.selected_ids ?? [];
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : body.reason;
  if (!Array.isArray(selectedIds) || selectedIds.length > 5
    || selectedIds.some((id) => typeof id !== 'string' || !id || id.length > 128)
    || new Set(selectedIds).size !== selectedIds.length) {
    throw new HttpError(400, 'invalid_selected_ids', 'selected_ids must contain at most five unique identifiers.');
  }
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new HttpError(400, 'invalid_idempotency_key', 'idempotency_key is required.');
  }
  if (reason != null && typeof reason !== 'string') {
    throw new HttpError(400, 'invalid_choice_reason', 'reason must be a string.');
  }
  if (reason && reason.length > 240) {
    throw new HttpError(400, 'invalid_choice_reason', 'reason must contain at most 240 characters.');
  }
  return { selectedIds, idempotencyKey, reason: reason || null };
}

async function loadBodies(client, session, selectedIds, { requireActive }) {
  if (selectedIds.length === 0) return [];
  const eligibility = requireActive ? ' AND sealed = false AND status = \'active\'' : '';
  const result = await client.query(`
    SELECT id, scope_id, language, type, hook, body, anchor, tier_since
    FROM hearth_entries
    WHERE id = ANY($1::STRING[])
      AND scope_id = ANY($2::STRING[])${eligibility}
  `, [selectedIds, ['demo_public', session.scope_id]]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  if (byId.size !== selectedIds.length) {
    throw new HttpError(409, 'selection_unavailable', 'A selected memory is no longer available to this session.');
  }
  return selectedIds.map((id) => byId.get(id));
}

function delivery(runId, snapshot, selectedIds, rows, replayed) {
  const selected = new Set(selectedIds);
  return {
    run_id: runId,
    choice: selectedIds.length > 0 ? 'open' : 'skip',
    selected_ids: selectedIds,
    skipped_ids: snapshot.map((item) => item.id).filter((id) => !selected.has(id)),
    memories: rows.map(({ scope_id: _scope, anchor: _anchor, tier_since: _tier, ...row }) => row),
    touched_ids: selectedIds,
    replayed,
  };
}

export function createAgentChoiceService(pool) {
  return async function choose(session, runId, input) {
    if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
      throw new HttpError(400, 'invalid_run_id', 'run_id must be a UUID.');
    }
    return withTransaction(pool, async (client) => {
      const found = await client.query(`
        SELECT run_id, candidate_snapshot, selected_ids, choice, status,
               idempotency_key, expires_at
        FROM hearth_agent_runs
        WHERE run_id = $1 AND session_id_hash = $2
        FOR UPDATE
      `, [runId, session.session_id_hash]);
      if (found.rowCount !== 1) {
        throw new HttpError(404, 'run_not_found', 'The agent run was not found in this session.');
      }

      const run = found.rows[0];
      const snapshot = jsonArray(run.candidate_snapshot);
      const snapshotIds = new Set(snapshot.map((item) => item.id));
      if (run.idempotency_key !== input.idempotencyKey) {
        throw new HttpError(409, 'idempotency_mismatch', 'The idempotency key does not belong to this run.');
      }

      if (run.status === 'completed') {
        const storedIds = jsonArray(run.selected_ids);
        if (!sameIds(storedIds, input.selectedIds)) {
          throw new HttpError(409, 'run_already_completed', 'This run was already completed with a different choice.');
        }
        const rows = await loadBodies(client, session, storedIds, { requireActive: false });
        return delivery(runId, snapshot, storedIds, rows, true);
      }
      if (run.status !== 'surfaced') {
        throw new HttpError(409, 'run_not_selectable', 'This run cannot accept a choice.');
      }
      if (new Date(run.expires_at).getTime() <= Date.now()) {
        throw new HttpError(410, 'run_expired', 'This agent run has expired.');
      }
      if (input.selectedIds.some((id) => !snapshotIds.has(id))) {
        throw new HttpError(409, 'selection_not_surfaced', 'Only memories in the immutable candidate snapshot may be opened.');
      }

      const rows = await loadBodies(client, session, input.selectedIds, { requireActive: true });
      const now = new Date();
      for (const row of rows) {
        await client.query(`
          INSERT INTO hearth_session_entry_state
            (session_id_hash, entry_id, effective_last_accessed, effective_anchor,
             effective_tier_since, updated_at)
          VALUES ($1, $2, $3, $4, $5, $3)
          ON CONFLICT (session_id_hash, entry_id) DO UPDATE SET
            effective_last_accessed = excluded.effective_last_accessed,
            effective_anchor = excluded.effective_anchor,
            effective_tier_since = excluded.effective_tier_since,
            updated_at = excluded.updated_at
        `, [session.session_id_hash, row.id, now, Number(row.anchor), row.tier_since]);
        await client.query(`
          INSERT INTO hearth_touch_log
            (entry_id, session_id_hash, scope_id, touched_at, source, run_id)
          VALUES ($1, $2, $3, $4, 'agent', $5)
        `, [row.id, session.session_id_hash, row.scope_id, now, runId]);
      }

      const choice = input.selectedIds.length > 0 ? 'open' : 'skip';
      await client.query(`
        UPDATE hearth_agent_runs
        SET status = 'completed',
            selected_ids = $3::JSONB,
            choice = $4,
            choice_reason = $5,
            updated_at = $6
        WHERE run_id = $1 AND session_id_hash = $2
      `, [runId, session.session_id_hash, JSON.stringify(input.selectedIds), choice, input.reason, now]);

      return delivery(runId, snapshot, input.selectedIds, rows, false);
    });
  };
}

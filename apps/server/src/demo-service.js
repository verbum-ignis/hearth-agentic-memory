import { randomUUID } from 'node:crypto';
import { bandForEntry } from '../../../packages/core/src/decay.js';
import { contentHash } from '../../../packages/core/src/embedding.js';
import { withTransaction } from '../../../packages/db/src/pool.js';
import { HttpError } from './errors.js';
import { consumeSessionQuota } from './quota.js';

const TYPES = new Set(['letter', 'event', 'project', 'stream']);
const LANGUAGES = new Set(['en', 'zh']);

export function validateMemoryInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_request', 'A JSON object is required.');
  const hook = typeof body.hook === 'string' ? body.hook.trim() : '';
  const memoryBody = typeof body.body === 'string' ? body.body.trim() : '';
  const type = body.type ?? 'event';
  const language = body.language ?? 'en';
  const keys = Array.isArray(body.keys) ? [...new Set(body.keys.map((key) => typeof key === 'string' ? key.trim() : '').filter(Boolean))] : [];
  if (!hook || hook.length > 240) throw new HttpError(400, 'invalid_hook', 'hook must contain 1–240 characters.');
  if (!memoryBody || memoryBody.length > 2_000) throw new HttpError(400, 'invalid_body', 'body must contain 1–2000 characters.');
  if (!TYPES.has(type)) throw new HttpError(400, 'invalid_type', 'type must be letter, event, project or stream.');
  if (!LANGUAGES.has(language)) throw new HttpError(400, 'invalid_language', 'language must be en or zh.');
  if (keys.length > 10 || keys.some((key) => key.length > 80)) throw new HttpError(400, 'invalid_keys', 'keys must contain at most 10 values of 80 characters.');
  return { hook, body: memoryBody, type, language, keys };
}

export function createDemoService(pool, { writeLimit = Number(process.env.SESSION_WRITE_LIMIT ?? 10) } = {}) {
  return {
    async save(session, input) {
      const id = `memory_${randomUUID()}`;
      const now = new Date();
      const entry = { id, ...input };
      await withTransaction(pool, async (client) => {
        await consumeSessionQuota(client, session.session_id_hash, 'write', writeLimit);
        await client.query(`
          INSERT INTO hearth_entries (
            id, scope_id, language, type, keys, hook, body, sealed, anchor,
            tier_since, last_accessed, status, created_at, updated_at,
            content_hash, embedding_status
          ) VALUES ($1,$2,$3,$4,$5::JSONB,$6,$7,false,0,$8,$8,'active',$8,$8,$9,'pending')
        `, [id, session.scope_id, input.language, input.type, JSON.stringify(input.keys), input.hook, input.body, now, contentHash(entry)]);
      });
      return { id, status: 'pending' };
    },

    async status(session, id) {
      const result = await pool.query(`
        SELECT id, embedding_status, embedding_updated_at
        FROM hearth_entries WHERE id = $1 AND scope_id = $2
      `, [id, session.scope_id]);
      if (result.rowCount !== 1) throw new HttpError(404, 'memory_not_found', 'Memory was not found in this session.');
      return {
        id: result.rows[0].id,
        status: result.rows[0].embedding_status,
        updated_at: result.rows[0].embedding_updated_at,
      };
    },

    async constellation(session) {
      const result = await pool.query(`
        SELECT e.id, e.scope_id, e.language, e.type, e.hook, e.status, e.sealed,
               e.last_accessed AS baseline_last_accessed,
               COALESCE(s.effective_anchor, e.anchor) AS anchor,
               COALESCE(s.effective_tier_since, e.tier_since) AS tier_since,
               COALESCE(s.effective_last_accessed, e.last_accessed) AS last_accessed,
               s.entry_id IS NOT NULL AS touched_in_session,
               e.embedding_status
        FROM hearth_entries AS e
        LEFT JOIN hearth_session_entry_state AS s
          ON s.session_id_hash = $1 AND s.entry_id = e.id
        WHERE e.scope_id = ANY($2::STRING[]) AND e.sealed = false AND e.status = 'active'
        ORDER BY e.id
      `, [session.session_id_hash, ['demo_public', session.scope_id]]);
      const asOf = new Date();
      return result.rows.map((row) => ({
        id: row.id,
        hook: row.hook,
        language: row.language,
        type: row.type,
        tier: Number(row.anchor),
        band: bandForEntry(row, asOf),
        baseline_band: bandForEntry({ ...row, last_accessed: row.baseline_last_accessed }, asOf),
        last_accessed: row.last_accessed,
        embedding_status: row.embedding_status,
        scope: row.scope_id === session.scope_id ? 'session' : 'demo',
        touched_in_session: Boolean(row.touched_in_session),
      }));
    },
  };
}

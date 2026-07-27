import { createPool, withTransaction } from '../packages/db/src/pool.js';
import { contentHash } from '../packages/core/src/embedding.js';
import { loadDemoData, validateDemoData } from './lib/demo-data.js';

const path = process.argv[2] ?? 'data/demo-sample.json';
const document = await loadDemoData(path);
const validation = validateDemoData(document, { allowPartial: document.entries.length !== 75 });
if (!validation.ok) throw new Error(`Seed validation failed:\n${validation.errors.join('\n')}`);

const pool = createPool({ applicationName: 'hearth-seed' });
try {
  await withTransaction(pool, async (client) => {
    for (const entry of document.entries) {
      const embeddingStatus = !entry.sealed
        && entry.status === 'active'
        && ['event', 'project', 'letter', 'stream'].includes(entry.type)
        ? 'pending'
        : 'not_required';
      await client.query(`
        UPSERT INTO hearth_entries (
          id, scope_id, language, type, keys, hook, body, trigger_date, trigger_done,
          sealed, anchor, tier_since, last_accessed, status, supersedes,
          created_at, updated_at, expires_at, content_hash,
          embedding, embedding_model, embedding_spec_version, embedding_status,
          embedding_updated_at, embedding_error, embedding_attempts,
          embedding_claimed_at, embedding_claim_token, embedding_next_retry_at
        ) VALUES (
          $1, 'demo_public', $2, $3, $4::JSONB, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, NULL,
          $14, $15, $16, $17,
          NULL, NULL, NULL, $18,
          NULL, NULL, 0, NULL, NULL, NULL
        )
      `, [
        entry.id,
        entry.language,
        entry.type,
        JSON.stringify(entry.keys),
        entry.hook,
        entry.body,
        entry.trigger_date ?? null,
        entry.trigger_done ?? false,
        entry.sealed,
        entry.tier,
        entry.tier_since,
        entry.last_accessed,
        entry.status,
        entry.created_at,
        entry.updated_at,
        entry.expires_at ?? null,
        contentHash(entry),
        embeddingStatus,
      ]);
    }

    // Relation targets are not guaranteed to appear before their replacements
    // in the editorial file. Link them only after every entry exists so the
    // self-referencing foreign key remains valid regardless of file order.
    for (const entry of document.entries) {
      if (!entry.supersedes) continue;
      await client.query(`
        UPDATE hearth_entries
        SET supersedes = $2
        WHERE id = $1 AND scope_id = 'demo_public'
      `, [entry.id, entry.supersedes]);
    }
  });
  process.stdout.write(`Seeded ${document.entries.length} fictional entries into demo_public.\n`);
} finally {
  await pool.end();
}

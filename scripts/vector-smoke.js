import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../packages/db/src/pool.js';
import { fixtureEmbedding, vectorLiteral } from '../packages/core/src/embedding.js';

const pool = createPool({ applicationName: 'hearth-vector-smoke' });
const queryVector = vectorLiteral(fixtureEmbedding('the box that never arrived'));
const scopes = ['smoke_a', 'smoke_b'];

try {
  await pool.query(`DELETE FROM hearth_entries WHERE scope_id = ANY($1::STRING[])`, [scopes]);
  for (let i = 0; i < 80; i += 1) {
    const scope = scopes[i % scopes.length];
    const id = `vector_smoke_${String(i).padStart(3, '0')}`;
    const text = i === 7 ? 'the box that never arrived' : `unrelated fixture memory ${i}`;
    const vector = vectorLiteral(fixtureEmbedding(text));
    await pool.query(`
      INSERT INTO hearth_entries (
        id, scope_id, language, type, keys, hook, body, anchor, tier_since,
        last_accessed, status, created_at, updated_at, content_hash,
        embedding, embedding_model, embedding_spec_version, embedding_status,
        embedding_updated_at
      ) VALUES (
        $1, $2, 'en', 'event', '[]', $3, $3, 0, NULL,
        current_timestamp(), 'active', current_timestamp(), current_timestamp(), $4,
        $5::VECTOR, 'fixture-sha256-v1', 'hearth-v1', 'ready', current_timestamp()
      )
    `, [id, scope, text, `smoke-${i}`, vector]);
  }

  const query = `
    SELECT id, scope_id, embedding <=> $1::VECTOR AS distance
    FROM hearth_entries
    WHERE scope_id IN ('smoke_a', 'smoke_b') AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::VECTOR
    LIMIT 3
  `;
  const explain = await pool.query(`EXPLAIN (OPT) ${query}`, [queryVector]);
  const result = await pool.query(query, [queryVector]);
  const version = await pool.query('SELECT version() AS version');
  const setting = await pool.query(`SHOW CLUSTER SETTING feature.vector_index.enabled`);
  const plan = explain.rows.map((row) => Object.values(row).join(' ')).join('\n');
  if (!/hearth_entries_scope_embedding_idx|vector|cspann/iu.test(plan)) {
    throw new Error(`Vector index was not visible in EXPLAIN plan:\n${plan}`);
  }
  if (result.rows[0]?.id !== 'vector_smoke_007') {
    throw new Error(`Unexpected nearest result: ${JSON.stringify(result.rows[0])}`);
  }

  const evidence = [
    `captured_at=${new Date().toISOString()}`,
    `version=${version.rows[0].version}`,
    `feature.vector_index.enabled=${Object.values(setting.rows[0]).join(' ')}`,
    '',
    'query_results=',
    JSON.stringify(result.rows, null, 2),
    '',
    'explain_opt=',
    plan,
    '',
  ].join('\n');
  const evidenceDir = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(`${evidenceDir}vector-index.actual.txt`, evidence, 'utf8');
  process.stdout.write(evidence);
} finally {
  await pool.query(`DELETE FROM hearth_entries WHERE scope_id = ANY($1::STRING[])`, [scopes]).catch(() => {});
  await pool.end();
}

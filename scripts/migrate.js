import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { LOCAL_DATABASE_URL } from '../packages/db/src/pool.js';

const { Client } = pg;
const targetUrl = new URL(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
const databaseName = targetUrl.pathname.replace(/^\//u, '') || 'hearth';
const adminUrl = new URL(targetUrl);
adminUrl.pathname = '/defaultdb';

const admin = new Client({ connectionString: adminUrl.toString(), application_name: 'hearth-migrate-admin' });
await admin.connect();
try {
  if (!/^[a-z][a-z0-9_]*$/u.test(databaseName)) throw new Error(`Unsafe database name: ${databaseName}`);
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${databaseName}`);
  await admin.query('SET CLUSTER SETTING feature.vector_index.enabled = true');
} finally {
  await admin.end();
}

const migrationDirectory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d+_.+\.sql$/u.test(name))
  .sort();
const client = new Client({ connectionString: targetUrl.toString(), application_name: 'hearth-migrate' });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hearth_schema_migrations (
      filename STRING PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp()
    )
  `);
  let appliedCount = 0;
  for (const file of migrationFiles) {
    const applied = await client.query(
      'SELECT 1 FROM hearth_schema_migrations WHERE filename = $1',
      [file],
    );
    if (applied.rowCount === 1) continue;
    const sql = await readFile(`${migrationDirectory}/${file}`, 'utf8');
    await client.query(sql);
    await client.query(
      'INSERT INTO hearth_schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [file],
    );
    appliedCount += 1;
  }
  const version = await client.query('SELECT version() AS version');
  process.stdout.write(`Applied ${appliedCount}/${migrationFiles.length} pending migrations on ${version.rows[0].version}\n`);
} finally {
  await client.end();
}

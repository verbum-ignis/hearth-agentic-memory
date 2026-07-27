import { readFile } from 'node:fs/promises';
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

const migrationPath = fileURLToPath(new URL('../db/migrations/001_initial.sql', import.meta.url));
const sql = await readFile(migrationPath, 'utf8');
const client = new Client({ connectionString: targetUrl.toString(), application_name: 'hearth-migrate' });
await client.connect();
try {
  await client.query(sql);
  const version = await client.query('SELECT version() AS version');
  process.stdout.write(`Migration complete on ${version.rows[0].version}\n`);
} finally {
  await client.end();
}

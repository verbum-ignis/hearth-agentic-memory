import pg from 'pg';

const { Pool } = pg;

export const LOCAL_DATABASE_URL =
  'postgresql://root@localhost:26257/hearth?sslmode=disable';

export function createPool(options = {}) {
  return new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
    max: options.max ?? 8,
    application_name: options.applicationName ?? 'hearth-hackathon',
  });
}

export async function withTransaction(pool, fn, { maxRetries = 5 } = {}) {
  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code === '40001' && attempt < maxRetries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

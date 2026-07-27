import { createPool } from '../../../packages/db/src/pool.js';
import { fixtureProvider } from './providers/fixture.js';
import { processOne } from './worker.js';

const once = process.argv.includes('--once');
const pollMs = Number(process.env.WORKER_POLL_MS ?? 1_000);
const leaseMs = Number(process.env.WORKER_LEASE_MS ?? 60_000);
const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 5);
const providerName = process.env.EMBEDDING_PROVIDER ?? 'fixture';

if (providerName !== 'fixture') {
  throw new Error(`Provider ${providerName} is not implemented before the Day 0 model gate`);
}

const pool = createPool({ applicationName: process.env.WORKER_ID ?? 'hearth-worker' });

try {
  do {
    const result = await processOne(pool, fixtureProvider, { leaseMs, maxAttempts });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (once) break;
    if (result.status === 'idle') {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } while (true);
} finally {
  await pool.end();
}

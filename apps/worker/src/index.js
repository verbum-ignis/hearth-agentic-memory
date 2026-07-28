import { createPool } from '../../../packages/db/src/pool.js';
import { createCohereProvider } from './providers/cohere.js';
import { fixtureProvider } from './providers/fixture.js';
import { createJinaProvider } from './providers/jina.js';
import { processOne } from './worker.js';

const once = process.argv.includes('--once');
const untilIdle = process.argv.includes('--until-idle');
const pollMs = Number(process.env.WORKER_POLL_MS ?? 1_000);
const leaseMs = Number(process.env.WORKER_LEASE_MS ?? 60_000);
const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 5);
const providerName = process.env.EMBEDDING_PROVIDER ?? 'fixture';

const provider = providerName === 'fixture'
  ? fixtureProvider
  : providerName === 'jina'
    ? createJinaProvider()
  : providerName === 'cohere'
    ? createCohereProvider()
    : null;

if (!provider) throw new Error(`Unknown embedding provider: ${providerName}`);

const pool = createPool({ applicationName: process.env.WORKER_ID ?? 'hearth-worker' });

try {
  do {
    const result = await processOne(pool, provider, { leaseMs, maxAttempts });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (once) break;
    if (untilIdle && result.status === 'idle') break;
    if (result.status === 'idle') {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } while (true);
} finally {
  await pool.end();
}

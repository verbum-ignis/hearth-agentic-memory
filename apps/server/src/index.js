import { createJinaProvider } from '../../worker/src/providers/jina.js';
import { createPool } from '../../../packages/db/src/pool.js';
import { createApp } from './app.js';
import { createRecallService } from './recall-service.js';
import { createSessionResolver } from './session.js';
import { createSurfaceService } from './surface-service.js';

const pool = createPool({ applicationName: 'hearth-server' });
const provider = createJinaProvider();
const recall = createRecallService(pool, provider);
const surface = createSurfaceService(pool, recall);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS is required in production');
}

const app = createApp({
  resolveSession: createSessionResolver(pool),
  recall,
  surface,
  allowedOrigins,
  trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 1),
});
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.log(JSON.stringify({ event: 'server_listening', port })));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

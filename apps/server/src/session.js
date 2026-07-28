import { withTransaction } from '../../../packages/db/src/pool.js';
import { consumeGlobalQuota, consumeIpQuota } from './quota.js';
import { SESSION_COOKIE, createSessionToken, parseCookies, sha256 } from './security.js';

const DAY_MS = 86_400_000;

export function createSessionResolver(pool, {
  secret = process.env.SESSION_HASH_SECRET,
  secureCookies = process.env.NODE_ENV === 'production',
  sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? DAY_MS),
  globalDailyLimit = Number(process.env.GLOBAL_SESSION_CREATE_LIMIT ?? 2_000),
  ipDailyLimit = Number(process.env.IP_SESSION_CREATE_LIMIT ?? 20),
} = {}) {
  if (!secret) throw new Error('SESSION_HASH_SECRET is required');

  return async function resolveSession(req, res) {
    const token = parseCookies(req.get('cookie')).get(SESSION_COOKIE);
    if (token) {
      const sessionIdHash = sha256(`${secret}:session:${token}`);
      const found = await pool.query(`
        SELECT session_id_hash, scope_id, expires_at
        FROM hearth_demo_sessions
        WHERE session_id_hash = $1 AND expires_at > current_timestamp()
      `, [sessionIdHash]);
      if (found.rowCount === 1) return found.rows[0];
    }

    const newToken = createSessionToken();
    const sessionIdHash = sha256(`${secret}:session:${newToken}`);
    const scopeId = `session_${sessionIdHash.slice(0, 24)}`;
    const ipHash = sha256(`${secret}:ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`);
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    const session = await withTransaction(pool, async (client) => {
      await consumeGlobalQuota(client, 'session_create', globalDailyLimit);
      await consumeIpQuota(client, ipHash, ipDailyLimit);
      const inserted = await client.query(`
        INSERT INTO hearth_demo_sessions
          (session_id_hash, scope_id, created_at, last_seen_at, expires_at)
        VALUES ($1, $2, current_timestamp(), current_timestamp(), $3)
        RETURNING session_id_hash, scope_id, expires_at
      `, [sessionIdHash, scopeId, expiresAt]);
      return inserted.rows[0];
    });

    const attributes = [
      `${SESSION_COOKIE}=${newToken}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
    ];
    if (secureCookies) attributes.push('Secure');
    res.append('Set-Cookie', attributes.join('; '));
    return session;
  };
}

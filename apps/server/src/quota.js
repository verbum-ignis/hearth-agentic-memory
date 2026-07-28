import { HttpError } from './errors.js';

const SESSION_COLUMNS = Object.freeze({
  embedding: 'embedding_count',
  surface: 'surface_count',
  write: 'write_count',
  llm: 'llm_count',
});

export async function consumeGlobalQuota(client, capability, initialLimit) {
  const result = await client.query(`
    INSERT INTO hearth_global_daily_usage
      (usage_date, capability, used, daily_limit, updated_at)
    VALUES (current_date, $1, 1, $2, current_timestamp())
    ON CONFLICT (usage_date, capability) DO UPDATE
      SET used = hearth_global_daily_usage.used + 1,
          updated_at = current_timestamp()
      WHERE hearth_global_daily_usage.used < hearth_global_daily_usage.daily_limit
    RETURNING used, daily_limit
  `, [capability, initialLimit]);
  if (result.rowCount !== 1) throw new HttpError(429, 'global_quota_exceeded', 'This demo has reached its daily capacity.');
  return result.rows[0];
}

export async function consumeIpQuota(client, ipHash, initialLimit) {
  const result = await client.query(`
    INSERT INTO hearth_ip_daily_usage
      (usage_date, ip_hash, capability, used, daily_limit, updated_at)
    VALUES (current_date, $1, 'session_create', 1, $2, current_timestamp())
    ON CONFLICT (usage_date, ip_hash, capability) DO UPDATE
      SET used = hearth_ip_daily_usage.used + 1,
          updated_at = current_timestamp()
      WHERE hearth_ip_daily_usage.used < hearth_ip_daily_usage.daily_limit
    RETURNING used, daily_limit
  `, [ipHash, initialLimit]);
  if (result.rowCount !== 1) throw new HttpError(429, 'session_rate_limited', 'Too many demo sessions were created from this network.');
  return result.rows[0];
}

export async function consumeSessionQuota(client, sessionIdHash, capability, limit) {
  const column = SESSION_COLUMNS[capability];
  if (!column) throw new TypeError(`Unsupported session quota: ${capability}`);
  const result = await client.query(`
    UPDATE hearth_demo_sessions
    SET ${column} = ${column} + 1, last_seen_at = current_timestamp()
    WHERE session_id_hash = $1 AND expires_at > current_timestamp() AND ${column} < $2
    RETURNING ${column} AS used
  `, [sessionIdHash, limit]);
  if (result.rowCount !== 1) throw new HttpError(429, 'session_quota_exceeded', `This session has reached its ${capability} limit.`);
  return result.rows[0];
}

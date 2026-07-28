import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'hearth_session';

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function parseCookies(header = '') {
  const cookies = new Map();
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

export function validateRecallInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_request', 'A JSON object is required.');
  }
  const { text, exclude_ids: excludeIds = [], top_k: topK = 3 } = body;
  if (typeof text !== 'string' || !text.trim() || text.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new HttpError(400, 'invalid_text', 'text must contain 1–2000 safe characters.');
  }
  if (!Array.isArray(excludeIds) || excludeIds.length > 100 || excludeIds.some((id) => typeof id !== 'string' || id.length > 128)) {
    throw new HttpError(400, 'invalid_exclude_ids', 'exclude_ids must contain at most 100 identifiers.');
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > 5) {
    throw new HttpError(400, 'invalid_top_k', 'top_k must be an integer from 1 to 5.');
  }
  return { text: text.trim(), excludeIds: [...new Set(excludeIds)], topK };
}

export function requestGuards({ allowedOrigins = [] } = {}) {
  const origins = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (req.method !== 'POST') return next();
    if (!req.is('application/json')) return next(new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json.'));
    const origin = req.get('origin');
    if (origins.size > 0 && (!origin || !origins.has(origin))) {
      return next(new HttpError(403, 'origin_not_allowed', 'Request origin is not allowed.'));
    }
    return next();
  };
}

export function securityHeaders(_req, res, next) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  next();
}

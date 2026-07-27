import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SPEC_VERSION,
  canonicalEmbeddingText,
  canonicalQueryText,
  vectorLiteral,
} from '../../../../packages/core/src/embedding.js';

const DEFAULT_MODEL = 'jina-embeddings-v3';
const DEFAULT_API_BASE = 'https://api.jina.ai/v1';
const DOCUMENT_TASK = 'retrieval.passage';
const QUERY_TASK = 'retrieval.query';

function errorDetail(payload) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error?.message ?? 'unknown provider error';
  return String(detail).replace(/[\r\n]+/gu, ' ').slice(0, 300);
}

export function createJinaProvider({
  apiKey = process.env.JINA_API_KEY,
  model = process.env.EMBEDDING_MODEL_ID || DEFAULT_MODEL,
  apiBase = process.env.JINA_API_BASE || DEFAULT_API_BASE,
  timeoutMs = Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? 15_000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error('JINA_API_KEY is required when EMBEDDING_PROVIDER=jina');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('EMBEDDING_REQUEST_TIMEOUT_MS must be a positive number');
  }

  async function embedText(text, task) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${apiBase.replace(/\/$/u, '')}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          task,
          input: [text],
          dimensions: EMBEDDING_DIMENSIONS,
          normalized: true,
          embedding_type: 'float',
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Jina Embeddings timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Jina Embeddings returned invalid JSON (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`Jina Embeddings failed (HTTP ${response.status}): ${errorDetail(payload)}`);
    }

    const values = payload?.data?.[0]?.embedding;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Jina Embeddings returned ${Array.isArray(values) ? values.length : 'no'} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
    if (!values.every(Number.isFinite)) throw new Error('Jina Embeddings returned non-finite values');
    return vectorLiteral(values);
  }

  return {
    name: 'jina',
    model,
    specVersion: EMBEDDING_SPEC_VERSION,
    dimensions: EMBEDDING_DIMENSIONS,
    documentInputType: DOCUMENT_TASK,
    queryInputType: QUERY_TASK,
    async embed(entry) {
      return embedText(canonicalEmbeddingText(entry), DOCUMENT_TASK);
    },
    async embedQuery(query) {
      return embedText(canonicalQueryText(query), QUERY_TASK);
    },
  };
}

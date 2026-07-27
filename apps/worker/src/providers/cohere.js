import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_SPEC_VERSION,
  canonicalEmbeddingText,
  canonicalQueryText,
  vectorLiteral,
} from '../../../../packages/core/src/embedding.js';

const DEFAULT_MODEL = 'embed-multilingual-v3.0';
const DEFAULT_API_BASE = 'https://api.cohere.com/v2';
const DOCUMENT_INPUT_TYPE = 'search_document';
const QUERY_INPUT_TYPE = 'search_query';

function errorDetail(payload) {
  const detail = payload?.message ?? payload?.error?.message ?? 'unknown provider error';
  return String(detail).replace(/[\r\n]+/gu, ' ').slice(0, 300);
}

export function createCohereProvider({
  apiKey = process.env.COHERE_API_KEY,
  model = process.env.EMBEDDING_MODEL_ID || DEFAULT_MODEL,
  apiBase = process.env.COHERE_API_BASE || DEFAULT_API_BASE,
  timeoutMs = Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? 15_000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error('COHERE_API_KEY is required when EMBEDDING_PROVIDER=cohere');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('EMBEDDING_REQUEST_TIMEOUT_MS must be a positive number');
  }

  async function embedText(text, inputType) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${apiBase.replace(/\/$/u, '')}/embed`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Client-Name': 'hearth-hackathon',
        },
        body: JSON.stringify({
          model,
          texts: [text],
          input_type: inputType,
          embedding_types: ['float'],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Cohere Embed timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Cohere Embed returned invalid JSON (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`Cohere Embed failed (HTTP ${response.status}): ${errorDetail(payload)}`);
    }

    const values = payload?.embeddings?.float?.[0];
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Cohere Embed returned ${Array.isArray(values) ? values.length : 'no'} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
    if (!values.every(Number.isFinite)) throw new Error('Cohere Embed returned non-finite values');
    return vectorLiteral(values);
  }

  return {
    name: 'cohere',
    model,
    specVersion: EMBEDDING_SPEC_VERSION,
    dimensions: EMBEDDING_DIMENSIONS,
    documentInputType: DOCUMENT_INPUT_TYPE,
    queryInputType: QUERY_INPUT_TYPE,
    async embed(entry) {
      return embedText(canonicalEmbeddingText(entry), DOCUMENT_INPUT_TYPE);
    },
    async embedQuery(query) {
      return embedText(canonicalQueryText(query), QUERY_INPUT_TYPE);
    },
  };
}

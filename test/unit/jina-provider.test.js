import assert from 'node:assert/strict';
import test from 'node:test';
import { createJinaProvider } from '../../apps/worker/src/providers/jina.js';
import { EMBEDDING_DIMENSIONS } from '../../packages/core/src/embedding.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('embeds entries with the retrieval.passage adapter and explicit vector contract', async () => {
  let request;
  const provider = createJinaProvider({
    apiKey: 'jina_test',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0.25) }] });
    },
  });
  const vector = await provider.embed({
    type: 'event', hook: 'A rainy café', keys: ['rain'], body: 'We talked until closing.',
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.jina.ai/v1/embeddings');
  assert.equal(request.options.headers.Authorization, 'Bearer jina_test');
  assert.deepEqual(body, {
    model: 'jina-embeddings-v3',
    task: 'retrieval.passage',
    input: ['Type: event\nHook: A rainy café\nKeys: rain\nBody: We talked until closing.'],
    dimensions: 1024,
    normalized: true,
    embedding_type: 'float',
  });
  assert.equal(vector.split(',').length, EMBEDDING_DIMENSIONS);
});

test('embeds recall text with retrieval.query and shared normalization', async () => {
  let body;
  const provider = createJinaProvider({
    apiKey: 'jina_test',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0) }] });
    },
  });
  await provider.embedQuery('  下雨天\t café  ');
  assert.equal(body.task, 'retrieval.query');
  assert.deepEqual(body.input, ['下雨天 café']);
});

test('rejects API errors and vectors with the wrong dimension', async () => {
  const failed = createJinaProvider({
    apiKey: 'jina_test',
    fetchImpl: async () => jsonResponse({ detail: 'rate limit reached' }, 429),
  });
  await assert.rejects(() => failed.embedQuery('home'), /HTTP 429.*rate limit reached/u);

  const wrongDimension = createJinaProvider({
    apiKey: 'jina_test',
    fetchImpl: async () => jsonResponse({ data: [{ embedding: [0, 1] }] }),
  });
  await assert.rejects(() => wrongDimension.embedQuery('home'), /returned 2 dimensions; expected 1024/u);
});

test('fails configuration early without an API key', () => {
  assert.throws(() => createJinaProvider({ apiKey: '' }), /JINA_API_KEY is required/u);
});

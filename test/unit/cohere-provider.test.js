import assert from 'node:assert/strict';
import test from 'node:test';
import { createCohereProvider } from '../../apps/worker/src/providers/cohere.js';
import { EMBEDDING_DIMENSIONS } from '../../packages/core/src/embedding.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('embeds stored entries as search_document with the canonical text', async () => {
  let request;
  const provider = createCohereProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ embeddings: { float: [Array(EMBEDDING_DIMENSIONS).fill(0.25)] } });
    },
  });

  const vector = await provider.embed({
    type: 'event',
    hook: 'A remembered place',
    keys: ['hearth'],
    body: 'We found our way home.',
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.cohere.com/v2/embed');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(body.model, 'embed-multilingual-v3.0');
  assert.equal(body.input_type, 'search_document');
  assert.deepEqual(body.embedding_types, ['float']);
  assert.match(body.texts[0], /^Type: event\nHook: A remembered place/u);
  assert.equal(vector.split(',').length, EMBEDDING_DIMENSIONS);
});

test('embeds recall queries as search_query after shared Unicode normalization', async () => {
  let body;
  const provider = createCohereProvider({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ embeddings: { float: [Array(EMBEDDING_DIMENSIONS).fill(0)] } });
    },
  });
  await provider.embedQuery('  fullwidth：  篝火\t archive  ');
  assert.equal(body.input_type, 'search_query');
  assert.deepEqual(body.texts, ['fullwidth: 篝火 archive']);
});

test('rejects provider errors and vectors that do not match the database dimension', async () => {
  const failed = createCohereProvider({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ message: 'trial limit reached' }, 429),
  });
  await assert.rejects(() => failed.embedQuery('home'), /HTTP 429.*trial limit reached/u);

  const wrongDimension = createCohereProvider({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ embeddings: { float: [[0, 1]] } }),
  });
  await assert.rejects(() => wrongDimension.embedQuery('home'), /returned 2 dimensions; expected 1024/u);
});

test('fails configuration early without an API key', () => {
  assert.throws(
    () => createCohereProvider({ apiKey: '' }),
    /COHERE_API_KEY is required/u,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../../apps/server/src/app.js';
import { parseCookies, validateRecallInput } from '../../apps/server/src/security.js';

async function withServer(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeApp() {
  return createApp({
    allowedOrigins: ['https://demo.example'],
    resolveSession: async () => ({ session_id_hash: 'server-hash', scope_id: 'server-scope' }),
    recall: async (session) => ({
      candidates: [{ id: session.scope_id, hook: 'A safe hook', score: 0.99, type: 'event', language: 'en' }],
    }),
    surface: async () => ({ memories: [], run_id: 'run-1', semantic_status: 'ready' }),
    choose: async (_session, runId, input) => ({ run_id: runId, selected_ids: input.selectedIds }),
    demo: { save: async () => ({}), status: async () => ({}), constellation: async () => [] },
    logger: { error() {} },
  });
}

test('cookie parsing preserves an opaque base64url value', () => {
  assert.equal(parseCookies('other=x; hearth_session=A_b-9; flag=y').get('hearth_session'), 'A_b-9');
});

test('recall validation enforces the public input contract', () => {
  assert.deepEqual(validateRecallInput({ text: ' hello ', exclude_ids: ['a', 'a'], top_k: 5 }), {
    text: 'hello', excludeIds: ['a'], topK: 5,
  });
  assert.throws(() => validateRecallInput({ text: 'x', top_k: 6 }), /top_k/u);
  assert.throws(() => validateRecallInput({ text: `x${String.fromCharCode(0)}` }), /safe characters/u);
  assert.throws(() => validateRecallInput({ text: 'x', exclude_ids: Array(101).fill('a') }), /100/u);
});

test('POST endpoints enforce JSON and exact Origin before invoking a capability', async () => {
  await withServer(fakeApp(), async (base) => {
    const wrongOrigin = await fetch(`${base}/recall`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"text":"hello"}',
    });
    assert.equal(wrongOrigin.status, 403);

    const wrongType = await fetch(`${base}/recall`, {
      method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://demo.example' }, body: 'hello',
    });
    assert.equal(wrongType.status, 415);
  });
});

test('/recall uses server session scope and never exposes score or body', async () => {
  await withServer(fakeApp(), async (base) => {
    const response = await fetch(`${base}/recall`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://demo.example' },
      body: JSON.stringify({ text: 'hello', scope_id: 'attacker-scope' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.memories[0].id, 'server-scope');
    assert.equal('score' in payload.memories[0], false);
    assert.equal('body' in payload.memories[0], false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('agent choice validates the body before invoking delivery', async () => {
  await withServer(fakeApp(), async (base) => {
    const response = await fetch(`${base}/agent/runs/not-a-uuid/choice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://demo.example' },
      body: JSON.stringify({ selected_ids: ['a', 'a'], idempotency_key: 'key' }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_selected_ids');
  });
});

test('the judge-facing web demo is served by the same application', async () => {
  await withServer(fakeApp(), async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /A save point for agent memory/u);
    assert.match(html, /Memory constellation/u);
  });
});

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Request failed (${response.status})`);
  return payload;
}

function setStatus(element, text, kind = '') {
  element.textContent = text;
  element.className = `status ${kind}`;
}

$('#surface-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  setStatus($('#semantic-status'), 'remembering…');
  $('#surface-results').replaceChildren();
  try {
    const payload = await api('/surface', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: $('#surface-text').value, top_k: 5 }),
    });
    setStatus($('#semantic-status'), payload.semantic_status, payload.semantic_status);
    if (!payload.memories.length) $('#surface-results').innerHTML = '<p class="empty">Nothing surfaced. Silence is a valid result.</p>';
    for (const memory of payload.memories) {
      const card = document.createElement('article');
      card.className = 'memory-card';
      const hook = document.createElement('p'); hook.textContent = memory.hook;
      const meta = document.createElement('div'); meta.className = 'meta';
      const channel = document.createElement('span'); channel.className = 'channel'; channel.textContent = memory.channels?.join(' + ') || 'semantic';
      const type = document.createElement('span'); type.textContent = memory.type;
      meta.append(channel, type); card.append(hook, meta); $('#surface-results').append(card);
    }
  } catch (error) {
    setStatus($('#semantic-status'), error.message, 'unavailable');
  } finally { button.disabled = false; }
});

$('#save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  setStatus($('#save-status'), 'saving…');
  try {
    const saved = await api('/demo/memories', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hook: $('#memory-hook').value, body: $('#memory-body').value,
        keys: $('#memory-keys').value.split(',').map((key) => key.trim()).filter(Boolean), type: 'event', language: 'en',
      }),
    });
    setStatus($('#save-status'), saved.status);
    for (let attempt = 0; attempt < 15 && saved.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const current = await api(`/demo/memories/${encodeURIComponent(saved.id)}/status`);
      saved.status = current.status; setStatus($('#save-status'), current.status, current.status === 'ready' ? 'ready' : '');
      if (['ready', 'failed'].includes(current.status)) break;
    }
    await loadConstellation();
  } catch (error) { setStatus($('#save-status'), error.message, 'unavailable'); }
  finally { button.disabled = false; }
});

async function loadConstellation() {
  const root = $('#constellation'); root.innerHTML = '<p class="empty">Reading the sky…</p>';
  try {
    const payload = await api('/demo/constellation'); root.replaceChildren();
    const memories = payload.memories
      .filter((memory) => memory.scope === 'session' || memory.touched_in_session)
      .sort((a, b) => new Date(b.last_accessed) - new Date(a.last_accessed))
      .slice(0, 8);
    if (!memories.length) root.innerHTML = '<p class="empty">Open or save a memory and its light will appear here.</p>';
    for (const memory of memories) {
      const star = document.createElement('div'); star.className = `star ${memory.band}`;
      const hook = document.createElement('span'); hook.className = 'star-hook'; hook.textContent = memory.hook;
      const state = document.createElement('span'); state.className = 'star-state';
      state.textContent = memory.scope === 'session'
        ? `new · ${memory.band}`
        : `${memory.baseline_band} → ${memory.band}`;
      star.append(hook, state);
      star.title = `${memory.baseline_band} → ${memory.band} · tier ${memory.tier} · ${memory.embedding_status}`;
      root.append(star);
    }
  } catch (error) {
    root.replaceChildren();
    const message = document.createElement('p'); message.className = 'empty'; message.textContent = error.message;
    root.append(message);
  }
}

$('#refresh-constellation').addEventListener('click', loadConstellation);
loadConstellation();

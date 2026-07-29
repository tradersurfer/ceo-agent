const test = require('node:test');
const assert = require('node:assert/strict');
const PerplexityClient = require('../sdk/PerplexityClient');

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

test('search throws a clear error when no API key is configured', async () => {
  // Explicit apiKey: null still falls through to process.env.PERPLEXITY_API_KEY
  // (same constructor pattern as every other sdk/*Client.js) — clear it for
  // the duration of this test so an ambient env var can't mask the "no key"
  // path this test exists to check.
  const original = process.env.PERPLEXITY_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  try {
    const client = new PerplexityClient({ apiKey: null });
    await assert.rejects(
      () => client.search({ query: 'ceo agent skill dispatch' }),
      /PERPLEXITY_API_KEY is not set/
    );
  } finally {
    if (original !== undefined) process.env.PERPLEXITY_API_KEY = original;
  }
});

test('search sends an Authorization: Bearer header and posts to /search, not /chat/completions', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  await withFetch(
    async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return { ok: true, json: async () => ({ results: [], id: 'req_1' }) };
    },
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      await client.search({ query: 'hello' });
    }
  );

  assert.equal(capturedUrl, 'https://api.perplexity.ai/search');
  assert.equal(capturedHeaders.Authorization, 'Bearer pplx-test');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
});

test('search sends query and, when given, max_results in the request body', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ results: [], id: 'req_1' }) };
    },
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      await client.search({ query: 'ceo agent', maxResults: 5 });
    }
  );

  assert.equal(capturedBody.query, 'ceo agent');
  assert.equal(capturedBody.max_results, 5);
});

test('search omits max_results from the request body when not given', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ results: [], id: 'req_1' }) };
    },
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      await client.search({ query: 'ceo agent' });
    }
  );

  assert.equal('max_results' in capturedBody, false);
});

test('search maps a realistic response onto {results, id}, converting last_updated to lastUpdated', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        results: [
          { title: 'CEO Agent skill dispatch', url: 'https://example.com/a', snippet: 'An excerpt...', date: '2026-07-28', last_updated: '2026-07-28' },
          { title: 'Untitled result', url: 'https://example.com/b', snippet: 'Another excerpt.', date: null, last_updated: null },
        ],
        id: 'req_abc',
        server_time: '2026-07-28T00:00:00Z',
      }),
    }),
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      const { results, id } = await client.search({ query: 'ceo agent' });

      assert.equal(id, 'req_abc');
      assert.equal(results.length, 2);
      assert.deepEqual(results[0], {
        title: 'CEO Agent skill dispatch',
        url: 'https://example.com/a',
        snippet: 'An excerpt...',
        date: '2026-07-28',
        lastUpdated: '2026-07-28',
      });
      assert.equal(results[1].date, null);
      assert.equal(results[1].lastUpdated, null);
    }
  );
});

test('search returns an empty results array when the response has no results field', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ id: 'req_empty' }) }),
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      const { results } = await client.search({ query: 'nothing found' });
      assert.deepEqual(results, []);
    }
  );
});

test('search throws with status + body text on a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 401, text: async () => '{"error":"invalid_api_key"}' }),
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-bad' });
      await assert.rejects(
        () => client.search({ query: 'hello' }),
        /Perplexity search failed: 401/
      );
    }
  );
});

test('search forwards an AbortSignal straight through to fetch', async () => {
  const controller = new AbortController();
  let capturedInit = null;
  await withFetch(
    async (url, init) => {
      capturedInit = init;
      return { ok: true, json: async () => ({ results: [], id: 'req_1' }) };
    },
    async () => {
      const client = new PerplexityClient({ apiKey: 'pplx-test' });
      await client.search({ query: 'hello', signal: controller.signal });
    }
  );
  assert.equal(capturedInit.signal, controller.signal);
});

test('constructor falls back to process.env.PERPLEXITY_API_KEY when no explicit apiKey option is given', () => {
  const original = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = 'pplx-from-env';
  try {
    const client = new PerplexityClient();
    assert.equal(client.apiKey, 'pplx-from-env');
  } finally {
    if (original === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = original;
  }
});

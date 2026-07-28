const test = require('node:test');
const assert = require('node:assert/strict');
const GoogleClient = require('../sdk/GoogleClient');

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

test('chatCompletion throws a clear error when no API key is configured', async () => {
  const client = new GoogleClient({ apiKey: null });
  await assert.rejects(
    () => client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] }),
    /GOOGLE_AI_STUDIO_API_KEY is not set/
  );
});

test('chatCompletion sends an x-goog-api-key header (not Authorization: Bearer, not x-api-key) and hits models/{model}:generateContent', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  await withFetch(
    async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'hello' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] });
    }
  );

  assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent');
  assert.equal(capturedHeaders['x-goog-api-key'], 'goog-test');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
  assert.equal(capturedHeaders.Authorization, undefined, 'must not use OpenAI/OpenRouter-style Authorization: Bearer');
  assert.equal(capturedHeaders['x-api-key'], undefined, 'must not use Anthropic-style x-api-key');
});

test('chatCompletion extracts a leading system-role message into the top-level `systemInstruction` field, not into `contents`', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ candidates: [], usageMetadata: {} }) };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await client.chatCompletion({
        model: 'gemini-3-pro',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });
    }
  );

  assert.deepEqual(capturedBody.systemInstruction, { parts: [{ text: 'You are a helpful assistant.' }] });
  assert.deepEqual(capturedBody.contents, [{ role: 'user', parts: [{ text: 'Hello' }] }]);
  assert.equal(capturedBody.generationConfig.maxOutputTokens, 1024, 'default maxTokens should match the other clients\' default');
});

test('chatCompletion maps an "assistant"-role message to Gemini\'s "model" role, not "assistant"', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ candidates: [], usageMetadata: {} }) };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await client.chatCompletion({
        model: 'gemini-3-pro',
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello there' },
          { role: 'user', content: 'How are you?' },
        ],
      });
    }
  );

  assert.deepEqual(capturedBody.contents, [
    { role: 'user', parts: [{ text: 'Hi' }] },
    { role: 'model', parts: [{ text: 'Hello there' }] },
    { role: 'user', parts: [{ text: 'How are you?' }] },
  ]);
});

test('chatCompletion respects an explicit maxTokens override, sent as generationConfig.maxOutputTokens', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ candidates: [], usageMetadata: {} }) };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }], maxTokens: 4096 });
    }
  );
  assert.equal(capturedBody.generationConfig.maxOutputTokens, 4096);
});

test('chatCompletion throws with status + body text on a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 429, text: async () => '{"error":"rate_limited"}' }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await assert.rejects(
        () => client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] }),
        /Google completion failed: 429/
      );
    }
  );
});

test('chatCompletion returns empty text when the response has no candidates', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ candidates: [], usageMetadata: {} }) }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const { text } = await client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(text, '');
    }
  );
});

// --- Usage mapping: realistic response body per Gemini's live
// GenerateContentResponse reference (verified 2026-07-27 — see
// sdk/GoogleClient.js's docstring): usageMetadata.{promptTokenCount,
// candidatesTokenCount, totalTokenCount, cachedContentTokenCount}. Assert
// the mapped shape matches exactly what core/UsageTracker.js#recordUsage
// expects (promptTokens, completionTokens, totalTokens, cachedTokens,
// cacheCreationTokens, cacheReadTokens) — the same shape
// OpenRouterClient/AnthropicClient/OpenAIClient already return, so
// UsageTracker needs zero changes. ------------------------------------------

test('chatCompletion maps a realistic Gemini usage response onto UsageTracker\'s generic usage shape', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { role: 'model', parts: [{ text: 'The answer is 42.' }] }, finishReason: 'STOP' }],
        usageMetadata: {
          promptTokenCount: 2006,
          cachedContentTokenCount: 1920,
          candidatesTokenCount: 300,
          totalTokenCount: 2306,
        },
      }),
    }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const { text, usage } = await client.chatCompletion({
        model: 'gemini-3-pro',
        messages: [{ role: 'user', content: 'What is the answer?' }],
      });

      assert.equal(text, 'The answer is 42.');
      // promptTokenCount is read directly (this client's least-certain
      // mapping — see docstring: whether it already includes cached tokens
      // could not be confirmed from reachable docs, unlike Anthropic's
      // confirmed-exclusive or OpenAI's confirmed-inclusive input_tokens).
      assert.equal(usage.promptTokens, 2006);
      assert.equal(usage.completionTokens, 300);
      assert.equal(usage.totalTokens, 2306);
      assert.equal(usage.cachedTokens, 1920);
      assert.equal(usage.cacheReadTokens, 1920, 'cacheReadTokens reuses cachedTokens — Gemini has one field for "read from cache"');
      // Gemini exposes no cache-write/cache-creation figure on this response
      // shape at all (unlike Anthropic's cache_creation_input_tokens or
      // OpenAI's cache_write_tokens) — must be null, not 0 or undefined.
      assert.equal(usage.cacheCreationTokens, null);
    }
  );
});

test('chatCompletion usage mapping handles an uncached response (no cachedContentTokenCount field present) without throwing', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3, totalTokenCount: 11 },
      }),
    }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const { usage } = await client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] });

      assert.equal(usage.promptTokens, 8);
      assert.equal(usage.completionTokens, 3);
      assert.equal(usage.totalTokens, 11);
      assert.equal(usage.cacheCreationTokens, null);
      assert.equal(usage.cacheReadTokens, null);
      assert.equal(usage.cachedTokens, null);
    }
  );
});

test('chatCompletion usage mapping handles a response with no usageMetadata object at all without throwing', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ candidates: [] }) }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const { usage } = await client.chatCompletion({ model: 'gemini-3-pro', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(usage.promptTokens, null);
      assert.equal(usage.completionTokens, null);
      assert.equal(usage.totalTokens, null);
      assert.equal(usage.cachedTokens, null);
      assert.equal(usage.cacheCreationTokens, null);
      assert.equal(usage.cacheReadTokens, null);
    }
  );
});

// --- listModels(): real endpoint, but auth-required unlike OpenRouter's
// key-free /models — same asymmetry AnthropicClient/OpenAIClient already
// flag, confirmed independently true for Google too. -------------------------

test('listModels throws a clear error when no API key is configured (Google\'s /v1beta/models requires auth, unlike OpenRouter\'s)', async () => {
  const client = new GoogleClient({ apiKey: null });
  await assert.rejects(() => client.listModels(), /GOOGLE_AI_STUDIO_API_KEY is not set/);
});

test('listModels sends an x-goog-api-key header and returns the raw model records', async () => {
  let capturedHeaders = null;
  let capturedUrl = null;
  await withFetch(
    async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-3-pro', baseModelId: 'gemini-3-pro', version: '001', displayName: 'Gemini 3 Pro' },
          ],
        }),
      };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const models = await client.listModels();
      assert.equal(models.length, 1);
      // Google's `name` is a full resource path ("models/gemini-3-pro"), not
      // a bare id — left unmodified, same "no synthesized fields" treatment
      // AnthropicClient/OpenAIClient apply to their own model records.
      assert.equal(models[0].name, 'models/gemini-3-pro');
      assert.equal(models[0].pricing, undefined);
    }
  );
  assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(capturedHeaders['x-goog-api-key'], 'goog-test');
});

test('listModels paginates via nextPageToken until absent', async () => {
  let callCount = 0;
  await withFetch(
    async url => {
      callCount += 1;
      const pageToken = new URL(url).searchParams.get('pageToken');
      if (!pageToken) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'models/model-a' }], nextPageToken: 'page2' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ models: [{ name: 'models/model-b' }] }),
      };
    },
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const models = await client.listModels();
      assert.deepEqual(models.map(m => m.name), ['models/model-a', 'models/model-b']);
    }
  );
  assert.equal(callCount, 2);
});

test('listModels throws when the request fails', async () => {
  await withFetch(
    async () => ({ ok: false, status: 500 }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      await assert.rejects(() => client.listModels(), /Google \/v1beta\/models request failed: 500/);
    }
  );
});

test('listModels returns an empty array when the response has no models field', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({}) }),
    async () => {
      const client = new GoogleClient({ apiKey: 'goog-test' });
      const models = await client.listModels();
      assert.deepEqual(models, []);
    }
  );
});

test('constructor falls back to process.env.GOOGLE_AI_STUDIO_API_KEY when no explicit apiKey option is given', () => {
  const original = process.env.GOOGLE_AI_STUDIO_API_KEY;
  process.env.GOOGLE_AI_STUDIO_API_KEY = 'goog-from-env';
  try {
    const client = new GoogleClient();
    assert.equal(client.apiKey, 'goog-from-env');
  } finally {
    if (original === undefined) delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    else process.env.GOOGLE_AI_STUDIO_API_KEY = original;
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const AnthropicClient = require('../sdk/AnthropicClient');

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

test('chatCompletion throws a clear error when no API key is configured', async () => {
  const client = new AnthropicClient({ apiKey: null });
  await assert.rejects(
    () => client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] }),
    /ANTHROPIC_API_KEY is not set/
  );
});

test('chatCompletion sends x-api-key + anthropic-version headers, not an Authorization: Bearer header', async () => {
  let capturedHeaders = null;
  await withFetch(
    async (url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      };
    },
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      await client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] });
    }
  );

  assert.equal(capturedHeaders['x-api-key'], 'sk-ant-test');
  assert.equal(capturedHeaders['anthropic-version'], '2023-06-01');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
  assert.equal(capturedHeaders.Authorization, undefined, 'must not use OAuth-style Authorization: Bearer for a plain API key');
});

test('chatCompletion extracts a leading system-role message into the top-level `system` field, not into `messages`', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      };
    },
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      await client.chatCompletion({
        model: 'claude-opus-5',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });
    }
  );

  assert.equal(capturedBody.system, 'You are a helpful assistant.');
  assert.deepEqual(capturedBody.messages, [{ role: 'user', content: 'Hello' }]);
  assert.equal(capturedBody.model, 'claude-opus-5');
  assert.equal(capturedBody.max_tokens, 1024, 'default maxTokens should match OpenRouterClient\'s default');
});

test('chatCompletion respects an explicit maxTokens override', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ content: [], usage: {} }) };
    },
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      await client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }], maxTokens: 4096 });
    }
  );
  assert.equal(capturedBody.max_tokens, 4096);
});

test('chatCompletion throws with status + body text on a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 429, text: async () => '{"error":"rate_limited"}' }),
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      await assert.rejects(
        () => client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] }),
        /Anthropic completion failed: 429/
      );
    }
  );
});

// --- Usage mapping: realistic response body per Anthropic's live Messages
// API docs (verified 2026-07-27 — see sdk/AnthropicClient.js's docstring):
// usage.{input_tokens, output_tokens, cache_creation_input_tokens,
// cache_read_input_tokens}. Assert the mapped shape matches exactly what
// core/UsageTracker.js#recordUsage expects (promptTokens, completionTokens,
// totalTokens, cachedTokens, cacheCreationTokens, cacheReadTokens) — the
// same shape OpenRouterClient#chatCompletion already returns, so
// UsageTracker needs zero changes. ---------------------------------------

test('chatCompletion maps a realistic Anthropic usage response onto UsageTracker\'s generic usage shape', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        id: 'msg_01abc',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'The answer is 42.' }],
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 25,
          output_tokens: 12,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200,
          cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 },
          service_tier: 'standard',
        },
      }),
    }),
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      const { text, usage } = await client.chatCompletion({
        model: 'claude-opus-5',
        messages: [{ role: 'user', content: 'What is the answer?' }],
      });

      assert.equal(text, 'The answer is 42.');
      // promptTokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
      // (Anthropic's input_tokens is the UNCACHED remainder only — see docstring).
      assert.equal(usage.promptTokens, 25 + 100 + 200);
      assert.equal(usage.completionTokens, 12);
      assert.equal(usage.totalTokens, 25 + 100 + 200 + 12);
      assert.equal(usage.cacheCreationTokens, 100);
      assert.equal(usage.cacheReadTokens, 200);
      // cachedTokens reuses cache_read_input_tokens — "tokens actually
      // served from cache", the same concept OpenAI/OpenRouter's
      // prompt_tokens_details.cached_tokens names (see docstring).
      assert.equal(usage.cachedTokens, 200);
    }
  );
});

test('chatCompletion usage mapping handles an uncached response (no cache fields present) without throwing', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'hi' }],
        usage: { input_tokens: 8, output_tokens: 3 },
      }),
    }),
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      const { usage } = await client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] });

      assert.equal(usage.promptTokens, 8);
      assert.equal(usage.completionTokens, 3);
      assert.equal(usage.totalTokens, 11);
      assert.equal(usage.cacheCreationTokens, null);
      assert.equal(usage.cacheReadTokens, null);
      assert.equal(usage.cachedTokens, null);
    }
  );
});

test('chatCompletion returns empty text when the response has no text content block', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }], usage: {} }) }),
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      const { text } = await client.chatCompletion({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(text, '');
    }
  );
});

// --- listModels(): real endpoint, but auth-required unlike OpenRouter's
// key-free /models — see sdk/AnthropicClient.js's docstring for the flagged
// asymmetry. ----------------------------------------------------------------

test('listModels throws a clear error when no API key is configured (Anthropic\'s /v1/models requires auth, unlike OpenRouter\'s)', async () => {
  const client = new AnthropicClient({ apiKey: null });
  await assert.rejects(() => client.listModels(), /ANTHROPIC_API_KEY is not set/);
});

test('listModels sends x-api-key + anthropic-version and returns the raw model records', async () => {
  let capturedHeaders = null;
  await withFetch(
    async (url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-opus-5', display_name: 'Claude Opus 5', type: 'model', max_input_tokens: 1000000, max_tokens: 128000 },
          ],
          has_more: false,
          first_id: 'claude-opus-5',
          last_id: 'claude-opus-5',
        }),
      };
    },
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      const models = await client.listModels();
      assert.equal(models.length, 1);
      assert.equal(models[0].id, 'claude-opus-5');
      // No pricing field is synthesized — Anthropic's own model records
      // carry no per-token pricing, unlike OpenRouter's.
      assert.equal(models[0].pricing, undefined);
    }
  );
  assert.equal(capturedHeaders['x-api-key'], 'sk-ant-test');
  assert.equal(capturedHeaders['anthropic-version'], '2023-06-01');
});

test('listModels paginates via after_id/has_more/last_id until has_more is false', async () => {
  let callCount = 0;
  await withFetch(
    async (url) => {
      callCount += 1;
      const afterId = new URL(url).searchParams.get('after_id');
      if (!afterId) {
        return {
          ok: true,
          json: async () => ({ data: [{ id: 'model-a', type: 'model' }], has_more: true, last_id: 'model-a' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'model-b', type: 'model' }], has_more: false, last_id: 'model-b' }),
      };
    },
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      const models = await client.listModels();
      assert.deepEqual(models.map(m => m.id), ['model-a', 'model-b']);
    }
  );
  assert.equal(callCount, 2);
});

test('listModels throws when the request fails', async () => {
  await withFetch(
    async () => ({ ok: false, status: 500 }),
    async () => {
      const client = new AnthropicClient({ apiKey: 'sk-ant-test' });
      await assert.rejects(() => client.listModels(), /Anthropic \/v1\/models request failed: 500/);
    }
  );
});

test('constructor falls back to process.env.ANTHROPIC_API_KEY when no explicit apiKey option is given', () => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
  try {
    const client = new AnthropicClient();
    assert.equal(client.apiKey, 'sk-ant-from-env');
  } finally {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  }
});

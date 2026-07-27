const test = require('node:test');
const assert = require('node:assert/strict');
const OpenAIClient = require('../sdk/OpenAIClient');

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

test('chatCompletion throws a clear error when no API key is configured', async () => {
  const client = new OpenAIClient({ apiKey: null });
  await assert.rejects(
    () => client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] }),
    /OPENAI_API_KEY is not set/
  );
});

test('chatCompletion sends an Authorization: Bearer header, hits /v1/responses, and matches OpenRouterClient\'s Bearer shape', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  await withFetch(
    async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] }],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
      };
    },
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });
    }
  );

  assert.equal(capturedUrl, 'https://api.openai.com/v1/responses');
  assert.equal(capturedHeaders.Authorization, 'Bearer sk-test');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
});

test('chatCompletion extracts a leading system-role message into the top-level `instructions` field, not into `input`', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output: [], usage: {} }) };
    },
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      await client.chatCompletion({
        model: 'gpt-6',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });
    }
  );

  assert.equal(capturedBody.instructions, 'You are a helpful assistant.');
  assert.deepEqual(capturedBody.input, [{ role: 'user', content: 'Hello' }]);
  assert.equal(capturedBody.model, 'gpt-6');
  assert.equal(capturedBody.max_output_tokens, 1024, 'default maxTokens should match OpenRouterClient\'s/AnthropicClient\'s default');
});

test('chatCompletion respects an explicit maxTokens override, sent as max_output_tokens', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output: [], usage: {} }) };
    },
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }], maxTokens: 4096 });
    }
  );
  assert.equal(capturedBody.max_output_tokens, 4096);
});

test('chatCompletion throws with status + body text on a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 429, text: async () => '{"error":"rate_limited"}' }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      await assert.rejects(
        () => client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] }),
        /OpenAI completion failed: 429/
      );
    }
  );
});

test('chatCompletion walks the real `output` array for text — there is no output_text field on the raw response', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        id: 'resp_01abc',
        object: 'response',
        output: [
          { type: 'reasoning', id: 'rs_1', summary: [] },
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The answer is 42.' }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const { text } = await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(text, 'The answer is 42.');
    }
  );
});

test('chatCompletion returns empty text when no assistant message / output_text content part is present', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ output: [{ type: 'reasoning', id: 'rs_1', summary: [] }], usage: {} }) }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const { text } = await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(text, '');
    }
  );
});

// --- Usage mapping: realistic response body per OpenAI's live Responses API
// docs (verified 2026-07-27 — see sdk/OpenAIClient.js's docstring):
// usage.{input_tokens, input_tokens_details.cached_tokens, output_tokens,
// output_tokens_details.reasoning_tokens, total_tokens}. Unlike Anthropic's
// input_tokens (which EXCLUDES cached tokens), OpenAI's input_tokens already
// INCLUDES them — confirmed from docs, not assumed — so promptTokens reads
// straight through with no addition. Assert the mapped shape matches exactly
// what core/UsageTracker.js#recordUsage expects (promptTokens,
// completionTokens, totalTokens, cachedTokens, cacheCreationTokens,
// cacheReadTokens) — the same shape OpenRouterClient/AnthropicClient already
// return, so UsageTracker needs zero changes. ------------------------------

test('chatCompletion maps a realistic OpenAI usage response onto UsageTracker\'s generic usage shape (cached tokens INCLUDED in input_tokens)', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        id: 'resp_01abc',
        object: 'response',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi there' }] },
        ],
        usage: {
          input_tokens: 2006,
          input_tokens_details: { cached_tokens: 1920 },
          output_tokens: 300,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2306,
        },
      }),
    }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const { usage } = await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });

      // promptTokens reads input_tokens directly — it already includes the
      // 1920 cached tokens, unlike Anthropic where a sum was required.
      assert.equal(usage.promptTokens, 2006);
      assert.equal(usage.completionTokens, 300);
      assert.equal(usage.totalTokens, 2306);
      assert.equal(usage.cachedTokens, 1920);
      assert.equal(usage.cacheReadTokens, 1920, 'cacheReadTokens reuses cachedTokens — OpenAI has one field for "read from cache"');
      // No cache_write_tokens present in this response — cacheCreationTokens
      // must be null, not 0 or undefined (mirrors AnthropicClient's
      // "unknown, not zero" treatment for absent cache fields).
      assert.equal(usage.cacheCreationTokens, null);
    }
  );
});

test('chatCompletion usage mapping reads cache_write_tokens when present (documented for newer models, defensively optional)', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: {
          input_tokens: 500,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 200 },
          output_tokens: 10,
          total_tokens: 510,
        },
      }),
    }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const { usage } = await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(usage.cacheCreationTokens, 200);
      assert.equal(usage.cachedTokens, 0);
    }
  );
});

test('chatCompletion usage mapping handles a response with no usage object at all without throwing', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ output: [] }) }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const { usage } = await client.chatCompletion({ model: 'gpt-6', messages: [{ role: 'user', content: 'hi' }] });
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
// key-free /models — same asymmetry AnthropicClient already flags, confirmed
// independently true for OpenAI. -------------------------------------------

test('listModels throws a clear error when no API key is configured (OpenAI\'s /v1/models requires auth, unlike OpenRouter\'s)', async () => {
  const client = new OpenAIClient({ apiKey: null });
  await assert.rejects(() => client.listModels(), /OPENAI_API_KEY is not set/);
});

test('listModels sends an Authorization: Bearer header and returns the raw model records, no pagination', async () => {
  let capturedHeaders = null;
  let capturedUrl = null;
  await withFetch(
    async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          object: 'list',
          data: [
            { id: 'gpt-6', object: 'model', created: 1700000000, owned_by: 'openai' },
            { id: 'gpt-6-mini', object: 'model', created: 1700000000, owned_by: 'openai' },
          ],
        }),
      };
    },
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const models = await client.listModels();
      assert.equal(models.length, 2);
      assert.equal(models[0].id, 'gpt-6');
      // No pricing field is synthesized — OpenAI's own model records carry
      // no per-token pricing, same gap AnthropicClient documents.
      assert.equal(models[0].pricing, undefined);
    }
  );
  assert.equal(capturedUrl, 'https://api.openai.com/v1/models');
  assert.equal(capturedHeaders.Authorization, 'Bearer sk-test');
});

test('listModels throws when the request fails', async () => {
  await withFetch(
    async () => ({ ok: false, status: 500 }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      await assert.rejects(() => client.listModels(), /OpenAI \/v1\/models request failed: 500/);
    }
  );
});

test('listModels returns an empty array when the response has no data field', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ object: 'list' }) }),
    async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test' });
      const models = await client.listModels();
      assert.deepEqual(models, []);
    }
  );
});

test('constructor falls back to process.env.OPENAI_API_KEY when no explicit apiKey option is given', () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-from-env';
  try {
    const client = new OpenAIClient();
    assert.equal(client.apiKey, 'sk-from-env');
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});

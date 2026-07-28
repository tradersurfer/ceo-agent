const test = require('node:test');
const assert = require('node:assert/strict');
const XaiClient = require('../sdk/XaiClient');

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

test('chatCompletion throws a clear error when no API key is configured', async () => {
  const client = new XaiClient({ apiKey: null });
  await assert.rejects(
    () => client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
    /XAI_API_KEY is not set/
  );
});

test('chatCompletion sends an Authorization: Bearer header, hits /v1/responses, and matches OpenRouterClient\'s/OpenAIClient\'s Bearer shape', async () => {
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
      const client = new XaiClient({ apiKey: 'xai-test' });
      await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] });
    }
  );

  assert.equal(capturedUrl, 'https://api.x.ai/v1/responses');
  assert.equal(capturedHeaders.Authorization, 'Bearer xai-test');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
});

test('chatCompletion passes a leading system-role message straight through as an `input` item, NOT into a top-level `instructions` field', async () => {
  // Deliberate deviation from OpenAIClient's handling of the structurally
  // similar Responses API shape: xAI's own worked example demonstrates a
  // system-role item living directly inside `input`, unlike OpenAI's
  // Responses API (no "system" role in `input` at all, requires a top-level
  // `instructions` string) — see sdk/XaiClient.js's docstring.
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output: [], usage: {} }) };
    },
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      await client.chatCompletion({
        model: 'grok-4.5',
        messages: [
          { role: 'system', content: 'You are Grok, a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });
    }
  );

  assert.equal(capturedBody.instructions, undefined, 'xAI client must not synthesize a top-level instructions field');
  assert.deepEqual(capturedBody.input, [
    { role: 'system', content: 'You are Grok, a helpful assistant.' },
    { role: 'user', content: 'Hello' },
  ]);
  assert.equal(capturedBody.model, 'grok-4.5');
  assert.equal(capturedBody.max_output_tokens, 1024, 'default maxTokens should match the other three clients\' default');
});

test('chatCompletion respects an explicit maxTokens override, sent as max_output_tokens', async () => {
  let capturedBody = null;
  await withFetch(
    async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output: [], usage: {} }) };
    },
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }], maxTokens: 4096 });
    }
  );
  assert.equal(capturedBody.max_output_tokens, 4096);
});

test('chatCompletion throws with status + body text on a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 429, text: async () => '{"error":"rate_limited"}' }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      await assert.rejects(
        () => client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] }),
        /xAI completion failed: 429/
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
            content: [{ type: 'output_text', text: '101 multiplied by 3 is 303.' }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const { text } = await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'What is 101*3?' }] });
      assert.equal(text, '101 multiplied by 3 is 303.');
    }
  );
});

test('chatCompletion returns empty text when no assistant message / output_text content part is present', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ output: [{ type: 'reasoning', id: 'rs_1', summary: [] }], usage: {} }) }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const { text } = await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(text, '');
    }
  );
});

// --- Usage mapping: realistic response body per xAI's live API reference and
// prompt-caching docs (verified 2026-07-28 — see sdk/XaiClient.js's
// docstring): usage.{input_tokens, input_tokens_details.cached_tokens,
// output_tokens, output_tokens_details.reasoning_tokens, total_tokens,
// num_sources_used}. xAI's own prompt-caching docs describe prompt-token
// accounting as inclusive of cached tokens (same direction as OpenAI's
// shape, opposite of Anthropic's exclusive input_tokens) — so promptTokens
// reads straight through with no addition. Assert the mapped shape matches
// exactly what core/UsageTracker.js#recordUsage expects (promptTokens,
// completionTokens, totalTokens, cachedTokens, cacheCreationTokens,
// cacheReadTokens) — the same shape OpenRouterClient/AnthropicClient/
// OpenAIClient/GoogleClient already return, so UsageTracker needs zero
// changes. ---------------------------------------------------------------

test('chatCompletion maps a realistic xAI usage response onto UsageTracker\'s generic usage shape (cached tokens INCLUDED in input_tokens)', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        id: 'resp_ad5663da',
        object: 'response',
        model: 'grok-4.5',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi there' }] },
        ],
        usage: {
          input_tokens: 2006,
          input_tokens_details: { cached_tokens: 1920 },
          output_tokens: 300,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2306,
          num_sources_used: 0,
        },
      }),
    }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const { usage } = await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] });

      // promptTokens reads input_tokens directly — it already includes the
      // 1920 cached tokens, unlike Anthropic where a sum was required.
      assert.equal(usage.promptTokens, 2006);
      assert.equal(usage.completionTokens, 300);
      assert.equal(usage.totalTokens, 2306);
      assert.equal(usage.cachedTokens, 1920);
      assert.equal(usage.cacheReadTokens, 1920, 'cacheReadTokens reuses cachedTokens — xAI has one field for "read from cache"');
      // xAI has no documented cache-write/cache-creation token field at all
      // (unlike Anthropic's always-present cache_creation_input_tokens, or
      // OpenAI's sometimes-present cache_write_tokens) — must be null, not
      // 0 or undefined.
      assert.equal(usage.cacheCreationTokens, null);
    }
  );
});

test('chatCompletion usage mapping handles a response with no usage object at all without throwing', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ output: [] }) }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const { usage } = await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(usage.promptTokens, null);
      assert.equal(usage.completionTokens, null);
      assert.equal(usage.totalTokens, null);
      assert.equal(usage.cachedTokens, null);
      assert.equal(usage.cacheCreationTokens, null);
      assert.equal(usage.cacheReadTokens, null);
    }
  );
});

test('chatCompletion usage mapping handles an uncached response (no input_tokens_details field present) without throwing', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] }],
        usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
      }),
    }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const { usage } = await client.chatCompletion({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(usage.promptTokens, 8);
      assert.equal(usage.completionTokens, 3);
      assert.equal(usage.totalTokens, 11);
      assert.equal(usage.cachedTokens, null);
      assert.equal(usage.cacheCreationTokens, null);
      assert.equal(usage.cacheReadTokens, null);
    }
  );
});

// --- listModels(): real endpoint, but auth-required unlike OpenRouter's
// key-free /models — same asymmetry Anthropic/OpenAI/GoogleClient already
// flag, confirmed independently true for xAI. -------------------------------

test('listModels throws a clear error when no API key is configured (xAI\'s /v1/models requires auth, unlike OpenRouter\'s)', async () => {
  const client = new XaiClient({ apiKey: null });
  await assert.rejects(() => client.listModels(), /XAI_API_KEY is not set/);
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
            {
              id: 'grok-4.5', object: 'model', created: 1700000000, owned_by: 'xai',
              context_length: 256000, prompt_text_token_price: 300, cached_prompt_text_token_price: 75,
              completion_text_token_price: 1500,
            },
            { id: 'grok-4.5-fast', object: 'model', created: 1700000000, owned_by: 'xai' },
          ],
        }),
      };
    },
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const models = await client.listModels();
      assert.equal(models.length, 2);
      assert.equal(models[0].id, 'grok-4.5');
      // Unlike Anthropic/OpenAI/Google's model records, xAI's DO carry
      // native per-token pricing fields — left as-is, not normalized into
      // OpenRouter's pricing.prompt/pricing.completion shape (see
      // sdk/XaiClient.js's docstring; no catalog-merging in this PR).
      assert.equal(models[0].prompt_text_token_price, 300);
      assert.equal(models[0].pricing, undefined);
    }
  );
  assert.equal(capturedUrl, 'https://api.x.ai/v1/models');
  assert.equal(capturedHeaders.Authorization, 'Bearer xai-test');
});

test('listModels throws when the request fails', async () => {
  await withFetch(
    async () => ({ ok: false, status: 500 }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      await assert.rejects(() => client.listModels(), /xAI \/v1\/models request failed: 500/);
    }
  );
});

test('listModels returns an empty array when the response has no data field', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ object: 'list' }) }),
    async () => {
      const client = new XaiClient({ apiKey: 'xai-test' });
      const models = await client.listModels();
      assert.deepEqual(models, []);
    }
  );
});

test('constructor falls back to process.env.XAI_API_KEY when no explicit apiKey option is given', () => {
  const original = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = 'xai-from-env';
  try {
    const client = new XaiClient();
    assert.equal(client.apiKey, 'xai-from-env');
  } finally {
    if (original === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = original;
  }
});

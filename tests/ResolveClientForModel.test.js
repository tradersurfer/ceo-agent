const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveClientForModel } = require('../core/resolveClientForModel');

function fakeClient(name) {
  return { name };
}

test('a connected Anthropic model resolves to the Anthropic client with the "anthropic/" prefix stripped', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');

  const result = resolveClientForModel('anthropic/claude-opus-5', { openrouter, anthropic });

  assert.equal(result.client, anthropic);
  assert.equal(result.providerModelId, 'claude-opus-5');
});

test('an anthropic/-prefixed model with no Anthropic connection falls back to OpenRouter, id unchanged', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('anthropic/claude-opus-5', { openrouter, anthropic: null });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'anthropic/claude-opus-5', 'id must not be stripped when routing through OpenRouter');
});

test('an anthropic/-prefixed model with the anthropic key simply absent from the registry also falls back to OpenRouter', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('anthropic/claude-opus-5', { openrouter });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'anthropic/claude-opus-5');
});

test('a non-Anthropic prefix always routes through OpenRouter, unchanged, regardless of Anthropic connection state', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');

  for (const modelId of ['openai/gpt-6-pro', 'google/gemini-3-pro', 'x-ai/grok-5']) {
    const withAnthropicConnected = resolveClientForModel(modelId, { openrouter, anthropic });
    assert.equal(withAnthropicConnected.client, openrouter, `${modelId} must route through OpenRouter even with Anthropic connected`);
    assert.equal(withAnthropicConnected.providerModelId, modelId);

    const withoutAnthropicConnected = resolveClientForModel(modelId, { openrouter, anthropic: null });
    assert.equal(withoutAnthropicConnected.client, openrouter);
    assert.equal(withoutAnthropicConnected.providerModelId, modelId);
  }
});

test('a null/undefined apiModelId falls back to OpenRouter unchanged rather than throwing', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');

  assert.deepEqual(resolveClientForModel(null, { openrouter, anthropic }), { client: openrouter, providerModelId: null });
  assert.deepEqual(resolveClientForModel(undefined, { openrouter, anthropic }), { client: openrouter, providerModelId: undefined });
});

test('no connections object at all still returns a defined shape (client undefined, id unchanged) rather than throwing', () => {
  const result = resolveClientForModel('anthropic/claude-opus-5', undefined);
  assert.equal(result.client, undefined);
  assert.equal(result.providerModelId, 'anthropic/claude-opus-5');
});

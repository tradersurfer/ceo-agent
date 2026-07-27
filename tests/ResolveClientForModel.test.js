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

test('a non-Anthropic, non-OpenAI prefix always routes through OpenRouter, unchanged, regardless of Anthropic/OpenAI connection state', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');
  const openai = fakeClient('openai');

  for (const modelId of ['google/gemini-3-pro', 'x-ai/grok-5']) {
    const withBothConnected = resolveClientForModel(modelId, { openrouter, anthropic, openai });
    assert.equal(withBothConnected.client, openrouter, `${modelId} must route through OpenRouter even with Anthropic/OpenAI connected`);
    assert.equal(withBothConnected.providerModelId, modelId);

    const withNeitherConnected = resolveClientForModel(modelId, { openrouter, anthropic: null, openai: null });
    assert.equal(withNeitherConnected.client, openrouter);
    assert.equal(withNeitherConnected.providerModelId, modelId);
  }
});

// --- OpenAI ('openai/' prefix, BYNGE Phase 2's second provider PR) --------
// core/ModelResolver.js's PROVIDER_PREFIXES maps BOTH the 'gpt' and 'codex'
// roles to OpenRouter's 'openai/' prefix (OpenRouter has no distinct
// "Codex" listing) — resolveClientForModel() matches on the model-id prefix
// only, so it must dispatch identically regardless of which role produced
// the id. These cases use model ids that plausibly came from either role.

test('a connected OpenAI model resolves to the OpenAI client with the "openai/" prefix stripped', () => {
  const openrouter = fakeClient('openrouter');
  const openai = fakeClient('openai');

  const result = resolveClientForModel('openai/gpt-6-pro', { openrouter, openai });

  assert.equal(result.client, openai);
  assert.equal(result.providerModelId, 'gpt-6-pro');
});

test('an openai/-prefixed model with no OpenAI connection falls back to OpenRouter, id unchanged', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('openai/gpt-6-pro', { openrouter, openai: null });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'openai/gpt-6-pro', 'id must not be stripped when routing through OpenRouter');
});

test('an openai/-prefixed model with the openai key simply absent from the registry also falls back to OpenRouter', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('openai/gpt-6-pro', { openrouter });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'openai/gpt-6-pro');
});

test('an openai/-prefixed codex-role model id (OpenRouter has no distinct Codex listing) dispatches through OpenAIClient identically to a gpt-role id', () => {
  const openrouter = fakeClient('openrouter');
  const openai = fakeClient('openai');

  const result = resolveClientForModel('openai/gpt-6-codex', { openrouter, openai });

  assert.equal(result.client, openai);
  assert.equal(result.providerModelId, 'gpt-6-codex');
});

test('Anthropic and OpenAI connections are resolved independently — connecting one does not affect the other\'s prefix', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');

  // OpenAI not connected, Anthropic is — an openai/ id must still fall back
  // to OpenRouter, not accidentally pick up the Anthropic client.
  const result = resolveClientForModel('openai/gpt-6-pro', { openrouter, anthropic, openai: null });
  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'openai/gpt-6-pro');
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

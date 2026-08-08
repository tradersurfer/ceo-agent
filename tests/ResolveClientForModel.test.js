const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveClientForModel } = require('../ceo-core/resolveClientForModel');

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

test('an unrecognized prefix (not anthropic/openai/google/x-ai) always routes through OpenRouter, unchanged, regardless of other providers\' connection state', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');
  const openai = fakeClient('openai');
  const google = fakeClient('google');
  const xai = fakeClient('xai');

  const modelId = 'mistralai/mistral-large';
  const withAllConnected = resolveClientForModel(modelId, { openrouter, anthropic, openai, google, xai });
  assert.equal(withAllConnected.client, openrouter, `${modelId} must route through OpenRouter even with every direct provider connected`);
  assert.equal(withAllConnected.providerModelId, modelId);

  const withNoneConnected = resolveClientForModel(modelId, { openrouter, anthropic: null, openai: null, google: null, xai: null });
  assert.equal(withNoneConnected.client, openrouter);
  assert.equal(withNoneConnected.providerModelId, modelId);
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

// --- Google ('google/' prefix, BYNGE Phase 2's third provider PR) ---------
// core/ModelResolver.js's PROVIDER_PREFIXES maps the 'gemini' role to
// OpenRouter's 'google/' prefix.

test('a connected Google model resolves to the Google client with the "google/" prefix stripped', () => {
  const openrouter = fakeClient('openrouter');
  const google = fakeClient('google');

  const result = resolveClientForModel('google/gemini-3-pro', { openrouter, google });

  assert.equal(result.client, google);
  assert.equal(result.providerModelId, 'gemini-3-pro');
});

test('a google/-prefixed model with no Google connection falls back to OpenRouter, id unchanged', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('google/gemini-3-pro', { openrouter, google: null });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'google/gemini-3-pro', 'id must not be stripped when routing through OpenRouter');
});

test('a google/-prefixed model with the google key simply absent from the registry also falls back to OpenRouter', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('google/gemini-3-pro', { openrouter });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'google/gemini-3-pro');
});

test('Anthropic, OpenAI, and Google connections are resolved independently — connecting one does not affect the others\' prefixes', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');
  const openai = fakeClient('openai');

  // Google not connected, Anthropic/OpenAI are — a google/ id must still
  // fall back to OpenRouter, not accidentally pick up another provider's client.
  const result = resolveClientForModel('google/gemini-3-pro', { openrouter, anthropic, openai, google: null });
  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'google/gemini-3-pro');
});

// --- xAI ('x-ai/' prefix, BYNGE Phase 2's fourth and last provider PR) ----
// core/ModelResolver.js's PROVIDER_PREFIXES maps the 'grok' role to
// OpenRouter's 'x-ai/' prefix — NOT 'xai/' (the only one of the four
// provider prefixes that doesn't equal its provider id verbatim).

test('a connected xAI model resolves to the xAI client with the "x-ai/" prefix stripped', () => {
  const openrouter = fakeClient('openrouter');
  const xai = fakeClient('xai');

  const result = resolveClientForModel('x-ai/grok-4.5', { openrouter, xai });

  assert.equal(result.client, xai);
  assert.equal(result.providerModelId, 'grok-4.5');
});

test('an x-ai/-prefixed model with no xAI connection falls back to OpenRouter, id unchanged', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('x-ai/grok-4.5', { openrouter, xai: null });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'x-ai/grok-4.5', 'id must not be stripped when routing through OpenRouter');
});

test('an x-ai/-prefixed model with the xai key simply absent from the registry also falls back to OpenRouter', () => {
  const openrouter = fakeClient('openrouter');

  const result = resolveClientForModel('x-ai/grok-4.5', { openrouter });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'x-ai/grok-4.5');
});

test('a bare "xai/"-prefixed id (the wrong, unhyphenated prefix) does NOT match — must fall back to OpenRouter unchanged', () => {
  // Guards against the exact mistake ADR-006/resolveClientForModel.js's
  // comments warn about: assuming the OpenRouter prefix equals the provider
  // id. Only "x-ai/" (verified from core/ModelResolver.js's
  // PROVIDER_PREFIXES) is a real OpenRouter prefix; "xai/" is not, so an id
  // using it must be treated as unrecognized, not accidentally routed to
  // the xAI client.
  const openrouter = fakeClient('openrouter');
  const xai = fakeClient('xai');

  const result = resolveClientForModel('xai/grok-4.5', { openrouter, xai });

  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'xai/grok-4.5');
});

test('Anthropic, OpenAI, Google, and xAI connections are resolved independently — connecting one does not affect the others\' prefixes', () => {
  const openrouter = fakeClient('openrouter');
  const anthropic = fakeClient('anthropic');
  const openai = fakeClient('openai');
  const google = fakeClient('google');

  // xAI not connected, the other three are — an x-ai/ id must still fall
  // back to OpenRouter, not accidentally pick up another provider's client.
  const result = resolveClientForModel('x-ai/grok-4.5', { openrouter, anthropic, openai, google, xai: null });
  assert.equal(result.client, openrouter);
  assert.equal(result.providerModelId, 'x-ai/grok-4.5');
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

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRoleModels } = require('../core/ModelResolver');

function model(id, created, prompt = '0.000001') {
  return {
    id,
    name: id,
    created,
    context_length: 100000,
    pricing: { prompt },
    architecture: { output_modalities: ['text'] },
  };
}

test('resolves provider product families rather than adjacent provider models', () => {
  const resolved = resolveRoleModels([
    model('google/gemma-4-flagship', 500),
    model('google/gemini-2.5-pro', 300),
    model('google/gemini-3-flash-lite', 400),
  ]);

  assert.equal(resolved.gemini.flagship.apiModelId, 'google/gemini-2.5-pro');
  assert.equal(resolved.gemini.efficient.apiModelId, 'google/gemini-3-flash-lite');
});

test('codex resolves independently from general GPT models', () => {
  const resolved = resolveRoleModels([
    model('openai/gpt-6-pro', 500),
    model('openai/gpt-5.3-codex', 400),
    model('openai/gpt-5.2-codex', 300),
  ]);

  assert.equal(resolved.gpt.flagship.apiModelId, 'openai/gpt-6-pro');
  assert.equal(resolved.codex.flagship.apiModelId, 'openai/gpt-5.3-codex');
});

test('flagship prefers stable premium family while efficient prefers newest small tier', () => {
  const resolved = resolveRoleModels([
    model('anthropic/claude-opus-4.8', 400),
    model('anthropic/claude-opus-4.8-fast', 450),
    model('anthropic/claude-opus-5-preview', 500),
    model('anthropic/claude-haiku-4.5', 350, '0.000001'),
    model('anthropic/claude-3-haiku', 100, '0.0000001'),
  ]);

  assert.equal(resolved.claude.flagship.apiModelId, 'anthropic/claude-opus-4.8');
  assert.equal(resolved.claude.efficient.apiModelId, 'anthropic/claude-haiku-4.5');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { maskKey } = require('../lib/ceoAgentServer');
const {
  ALL_DEPARTMENTS,
  buildConnections,
  buildCatalog,
  sanitizeDepartmentModelDefaults,
} = require('../lib/connectionsConfig');

test('buildConnections reports hasKey/active per provider and never leaks the raw key', () => {
  const env = {
    OPENROUTER_API_KEY: 'sk-or-1234567890abcd',
    ANTHROPIC_API_KEY: '',
  };
  const connections = buildConnections(env, maskKey);

  assert.deepEqual(Object.keys(connections).sort(), ['anthropic', 'google', 'openai', 'openrouter', 'xai'].sort());

  assert.equal(connections.openrouter.hasKey, true);
  assert.equal(connections.openrouter.active, true, 'openrouter is the only active ProviderClient in Phase 1');
  assert.notEqual(connections.openrouter.keyMasked, env.OPENROUTER_API_KEY, 'masked value must not equal the raw key');
  assert.ok(connections.openrouter.keyMasked.includes('•'));

  assert.equal(connections.anthropic.hasKey, false);
  assert.equal(connections.anthropic.keyMasked, null);
});

test('buildConnections marks every non-OpenRouter provider as not active (Phase 2 not built)', () => {
  const env = {
    OPENROUTER_API_KEY: 'sk-or-1234567890abcd',
    ANTHROPIC_API_KEY: 'sk-ant-1234567890abcd',
    OPENAI_API_KEY: 'sk-oa-1234567890abcd',
    GOOGLE_AI_STUDIO_API_KEY: 'aistudio-1234567890abcd',
    XAI_API_KEY: 'xai-1234567890abcd',
  };
  const connections = buildConnections(env, maskKey);

  assert.equal(connections.openrouter.active, true);
  for (const providerId of ['anthropic', 'openai', 'google', 'xai']) {
    assert.equal(connections[providerId].active, false, `${providerId} must not be marked active`);
    assert.equal(connections[providerId].hasKey, true, `${providerId} should still report a stored key`);
  }
});

test('buildCatalog reads resolved tiers per role from ModelBroker, defaulting to nulls when unresolved', () => {
  const fakeBroker = {
    getModel(role) {
      if (role === 'claude') {
        return {
          id: 'claude',
          tiers: {
            flagship: { apiModelId: 'anthropic/claude-opus-5' },
            efficient: { apiModelId: 'anthropic/claude-haiku-4.5' },
          },
        };
      }
      return { id: role }; // registered but never resolved (no OPENROUTER_API_KEY yet)
    },
  };

  const catalog = buildCatalog(fakeBroker);

  assert.equal(catalog.claude.flagship.apiModelId, 'anthropic/claude-opus-5');
  assert.equal(catalog.claude.efficient.apiModelId, 'anthropic/claude-haiku-4.5');
  assert.deepEqual(catalog.codex, { flagship: null, efficient: null });
  assert.deepEqual(catalog.gpt, { flagship: null, efficient: null });
  assert.deepEqual(Object.keys(catalog).sort(), ['claude', 'codex', 'gemini', 'gpt', 'grok'].sort());
});

test('sanitizeDepartmentModelDefaults keeps only valid department ids and valid catalog roles', () => {
  const result = sanitizeDepartmentModelDefaults(
    { marketing: 'grok', not_a_department: 'claude', technology: 'not_a_role', finance: 'gpt' },
    undefined
  );
  assert.deepEqual(result, { marketing: 'grok', finance: 'gpt' });
});

test('sanitizeDepartmentModelDefaults merges valid overrides on top of the existing fallback rather than replacing it wholesale', () => {
  const result = sanitizeDepartmentModelDefaults({ marketing: 'grok' }, { technology: 'gpt', legal: 'claude' });
  assert.deepEqual(result, { technology: 'gpt', legal: 'claude', marketing: 'grok' });
});

test('sanitizeDepartmentModelDefaults returns the fallback unchanged for non-object input', () => {
  assert.deepEqual(sanitizeDepartmentModelDefaults(null, { technology: 'codex' }), { technology: 'codex' });
  assert.deepEqual(sanitizeDepartmentModelDefaults('nonsense', undefined), {});
});

test('ALL_DEPARTMENTS matches the department set the rest of the app already uses (excludes executive)', () => {
  assert.deepEqual(ALL_DEPARTMENTS, ['finance', 'operations', 'technology', 'marketing', 'people', 'legal']);
});

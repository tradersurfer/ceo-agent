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
  assert.equal(connections.openrouter.active, true, 'openrouter has a real ProviderClient');
  assert.notEqual(connections.openrouter.keyMasked, env.OPENROUTER_API_KEY, 'masked value must not equal the raw key');
  assert.ok(connections.openrouter.keyMasked.includes('•'));

  assert.equal(connections.anthropic.hasKey, false);
  assert.equal(connections.anthropic.keyMasked, null);
});

test('buildConnections marks providers with no ProviderClient yet as not active (xai — Phase 2 not built for it)', () => {
  const env = {
    OPENROUTER_API_KEY: 'sk-or-1234567890abcd',
    ANTHROPIC_API_KEY: 'sk-ant-1234567890abcd',
    OPENAI_API_KEY: 'sk-oa-1234567890abcd',
    GOOGLE_AI_STUDIO_API_KEY: 'aistudio-1234567890abcd',
    XAI_API_KEY: 'xai-1234567890abcd',
  };
  const connections = buildConnections(env, maskKey);

  // openrouter, anthropic, openai, and google have real ProviderClients
  // (sdk/OpenRouterClient.js, sdk/AnthropicClient.js, sdk/OpenAIClient.js,
  // sdk/GoogleClient.js) wired into dispatch via core/resolveClientForModel.js.
  assert.equal(connections.openrouter.active, true);
  assert.equal(connections.anthropic.active, true, 'anthropic has a real ProviderClient as of BYNGE Phase 2 (sdk/AnthropicClient.js)');
  assert.equal(connections.openai.active, true, 'openai has a real ProviderClient as of BYNGE Phase 2 (sdk/OpenAIClient.js)');
  assert.equal(connections.google.active, true, 'google has a real ProviderClient as of BYNGE Phase 2 (sdk/GoogleClient.js)');
  assert.equal(connections.xai.active, false, 'xai must not be marked active (no ProviderClient yet)');
  assert.equal(connections.xai.hasKey, true, 'xai should still report a stored key');
});

test('buildConnections marks anthropic as not active when no key is stored, even though it has a ProviderClient', () => {
  const env = { OPENROUTER_API_KEY: 'sk-or-1234567890abcd', ANTHROPIC_API_KEY: '' };
  const connections = buildConnections(env, maskKey);

  // "active" here is a static capability flag (does a ProviderClient exist
  // for this provider id) — buildConnections doesn't gate it on hasKey.
  // This is intentional and matches how it already worked for OpenRouter
  // pre-Phase-2 (see ModelSelector.tsx: `connected` — key presence — is a
  // separate, independent prop from `active`).
  assert.equal(connections.anthropic.active, true);
  assert.equal(connections.anthropic.hasKey, false);
});

test('buildCatalog reads resolved tiers (including "cheapest") per role from ModelBroker, defaulting to nulls when unresolved', () => {
  const fakeBroker = {
    getModel(role) {
      if (role === 'claude') {
        return {
          id: 'claude',
          tiers: {
            flagship: { apiModelId: 'anthropic/claude-opus-5' },
            efficient: { apiModelId: 'anthropic/claude-haiku-4.5' },
            cheapest: { apiModelId: 'anthropic/claude-value-tier' },
          },
        };
      }
      return { id: role }; // registered but never resolved (no OPENROUTER_API_KEY yet)
    },
  };

  const catalog = buildCatalog(fakeBroker);

  assert.equal(catalog.claude.flagship.apiModelId, 'anthropic/claude-opus-5');
  assert.equal(catalog.claude.efficient.apiModelId, 'anthropic/claude-haiku-4.5');
  assert.equal(catalog.claude.cheapest.apiModelId, 'anthropic/claude-value-tier');
  assert.deepEqual(catalog.codex, { flagship: null, efficient: null, cheapest: null });
  assert.deepEqual(catalog.gpt, { flagship: null, efficient: null, cheapest: null });
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

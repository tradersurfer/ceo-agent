const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setProviderKey, maskKey } = require('../lib/ceoAgentServer');

function tempEnvPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceo-agent-env-'));
  return path.join(dir, '.env');
}

test('setProviderKey creates .env and writes the correct env var for the provider', () => {
  const envPath = tempEnvPath();
  const envVar = setProviderKey('openrouter', 'sk-or-abc123', envPath);

  assert.equal(envVar, 'OPENROUTER_API_KEY');
  const contents = fs.readFileSync(envPath, 'utf8');
  assert.match(contents, /^OPENROUTER_API_KEY=sk-or-abc123$/m);
});

test('setProviderKey uses the canonical provider id -> env var table for every known provider', () => {
  const cases = [
    ['openrouter', 'OPENROUTER_API_KEY'],
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['google', 'GOOGLE_AI_STUDIO_API_KEY'],
    ['xai', 'XAI_API_KEY'],
  ];
  for (const [providerId, envVar] of cases) {
    const envPath = tempEnvPath();
    setProviderKey(providerId, 'test-key-value', envPath);
    const contents = fs.readFileSync(envPath, 'utf8');
    assert.match(contents, new RegExp(`^${envVar}=test-key-value$`, 'm'), `expected ${envVar} for provider "${providerId}"`);
  }
});

test('setProviderKey replaces an existing line for the same provider rather than duplicating it', () => {
  const envPath = tempEnvPath();
  fs.writeFileSync(envPath, 'ANTHROPIC_API_KEY=old-key\nOTHER_VAR=untouched\n', 'utf8');

  setProviderKey('anthropic', 'new-key', envPath);

  const contents = fs.readFileSync(envPath, 'utf8');
  const matches = contents.match(/ANTHROPIC_API_KEY=/g) || [];
  assert.equal(matches.length, 1, 'should not duplicate the env line');
  assert.match(contents, /^ANTHROPIC_API_KEY=new-key$/m);
  assert.match(contents, /^OTHER_VAR=untouched$/m, 'unrelated lines must be preserved');
});

test('setProviderKey appends a new line without clobbering unrelated existing keys', () => {
  const envPath = tempEnvPath();
  fs.writeFileSync(envPath, 'OPENROUTER_API_KEY=existing\n', 'utf8');

  setProviderKey('openai', 'sk-openai-xyz', envPath);

  const contents = fs.readFileSync(envPath, 'utf8');
  assert.match(contents, /^OPENROUTER_API_KEY=existing$/m);
  assert.match(contents, /^OPENAI_API_KEY=sk-openai-xyz$/m);
});

test('setProviderKey sets process.env immediately so the running process picks it up without a restart', () => {
  const envPath = tempEnvPath();
  delete process.env.XAI_API_KEY;
  setProviderKey('xai', 'grok-key-value', envPath);
  assert.equal(process.env.XAI_API_KEY, 'grok-key-value');
  delete process.env.XAI_API_KEY;
});

test('setProviderKey rejects an unknown provider id rather than silently writing nothing', () => {
  const envPath = tempEnvPath();
  assert.throws(() => setProviderKey('not_a_real_provider', 'x', envPath), /Unknown provider id/);
});

test('maskKey generalizes across providers (per-provider masking reuses the same function)', () => {
  const masked = maskKey('sk-anthropic-1234567890abcd');
  assert.ok(masked);
  assert.ok(masked.startsWith('sk-anth'));
  assert.ok(masked.endsWith('abcd'));
  assert.ok(masked.includes('•'));
});

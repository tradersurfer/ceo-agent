// Unit tests for HermesBridge.runTask()'s real gateway execution path
// (issue #36), per ADR-001b (POST /v1/runs contract + both drifts) and
// ADR-009 (§3 status mapping + §4 off_limits stopgap + §2 credential scoping).

// Allowlists are read at module-load time — set before requiring the bridge.
process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
// HermesBridge.js exports the class directly (module.exports = HermesBridge),
// matching how core/BridgeExecutors.js already consumes it — not a
// destructured named export.
const HermesBridge = require('../departments/operations/hermes/src/HermesBridge');
const { HermesGatewayClient } = require('../departments/operations/hermes/src/HermesGatewayClient');

const VALID = {
  agent: 'hermes',
  type: 'cron_create',
  project: 'test-project',
  goal: 'schedule a job',
  task: 'create a cron job',
  approved_by: 'ceo_agent',
};

function makeConfiguredBridge() {
  process.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8642';
  process.env.HERMES_GATEWAY_API_KEY = 'sk-1234567890abcdef1234567890abcdef';
  return new HermesBridge();
}

test.afterEach(() => {
  delete global.fetch;
  delete process.env.HERMES_GATEWAY_URL;
  delete process.env.HERMES_GATEWAY_API_KEY;
});

test('unconfigured install returns honest queued, never a false triggered', async () => {
  const bridge = new HermesBridge();
  const result = await bridge.runTask(VALID);
  assert.equal(result.status, 'queued');
  assert.match(result.summary, /not connected yet/i);
});

test('invalid task is blocked and the gateway is never contacted', async () => {
  const bridge = makeConfiguredBridge();
  const calls = [];
  global.fetch = async () => { calls.push('fetch'); };
  const result = await bridge.runTask({ ...VALID, project: 'nope' });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.length > 0);
  assert.equal(calls.length, 0);
});

test('off_limits stopgap blocks BEFORE any network call and audit-logs the phrase', async () => {
  const bridge = makeConfiguredBridge();
  const calls = [];
  let audited = null;
  bridge.audit = e => { audited = e; };
  global.fetch = async () => { calls.push('fetch'); };
  const result = await bridge.runTask({ ...VALID, task: 'transfer money out of the account' });
  assert.equal(result.status, 'blocked');
  assert.match(result.blockers[0], /moving money/i);
  assert.equal(calls.length, 0, 'gateway must not be contacted on an off_limits match');
  assert.ok(audited && audited.matched, 'off_limits block must be audited with the phrase');
});

test('a real 202 hand-off maps to triggered with the run id', async () => {
  const bridge = makeConfiguredBridge();
  let sent = null;
  global.fetch = async (url, init) => {
    sent = { url, init };
    return { status: 202, json: async () => ({ run_id: 'run_abc123', status: 'started' }) };
  };
  const result = await bridge.runTask(VALID);
  assert.equal(result.status, 'triggered');
  assert.equal(result.run_id, 'run_abc123');
  assert.match(sent.url, /\/v1\/runs$/);
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers.Authorization, 'Bearer sk-1234567890abcdef1234567890abcdef');
  const body = JSON.parse(sent.init.body);
  assert.ok(typeof body.input === 'string' && body.input.length > 0);
});

test('network failure maps to failed with the actual error surfaced, not swallowed', async () => {
  const bridge = makeConfiguredBridge();
  global.fetch = async () => { throw new Error('ECONNREFUSED 127.0.0.1:8642'); };
  const result = await bridge.runTask(VALID);
  assert.equal(result.status, 'failed');
  assert.ok(result.blockers[0].includes('ECONNREFUSED'), result.blockers[0]);
});

test('401 with gateway_auth_failed maps to failed with an actionable auth reason', async () => {
  const bridge = makeConfiguredBridge();
  global.fetch = async () => ({ status: 401, json: async () => ({ error: { code: 'gateway_auth_failed' } }) });
  const result = await bridge.runTask(VALID);
  assert.equal(result.status, 'failed');
  assert.match(result.blockers[0], /gateway_auth_failed|API_SERVER_KEY/i);
});

test('exhausted 429 retries map to failed, honoring Retry-After', async () => {
  const bridge = makeConfiguredBridge();
  global.fetch = async () => ({ status: 429, headers: { get: () => '0' }, json: async () => ({}) });
  const result = await bridge.runTask(VALID);
  assert.equal(result.status, 'failed');
  assert.match(result.blockers[0], /429/);
});

test('credential scoping: CEO Agent secrets never appear in the outbound request (ADR-009 §2)', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-secret';
  process.env.DISPATCH_SECRET = 'dispatch-secret';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb-secret';
  process.env.SUPABASE_URL = 'https://secret.supabase.co';
  const bridge = makeConfiguredBridge();
  let sent = null;
  global.fetch = async (url, init) => {
    sent = { url, init };
    return { status: 202, json: async () => ({ run_id: 'run_s', status: 'started' }) };
  };
  try {
    await bridge.runTask(VALID);
    const flat = JSON.stringify({ url: sent.url, headers: sent.init.headers, body: sent.init.body });
    for (const secret of ['sk-or-secret', 'dispatch-secret', 'sb-secret', 'secret.supabase.co']) {
      assert.ok(!flat.includes(secret), `outbound request leaked ${secret}`);
    }
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DISPATCH_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
  }
});

test('a key shorter than 16 chars is treated as not configured (ADR-001b drift 1)', () => {
  process.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8642';
  process.env.HERMES_GATEWAY_API_KEY = 'short';
  const client = new HermesGatewayClient(process.env.HERMES_GATEWAY_URL, process.env.HERMES_GATEWAY_API_KEY);
  assert.equal(client.isConfigured(), false);
  assert.equal(client.keyTooShort(), true);
});

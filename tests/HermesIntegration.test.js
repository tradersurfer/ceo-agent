// Opt-in integration test for HermesBridge.runTask() live gateway round-trip.
// Skipped unless HERMES_GATEWAY_URL and HERMES_GATEWAY_API_KEY are both set.
// Run with: HERMES_GATEWAY_URL=http://127.0.0.1:8642 HERMES_GATEWAY_API_KEY=<key> npm test -- tests/HermesIntegration.test.js

// Allowlists are read at module-load time — must be set BEFORE requiring HermesBridge.
process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const HermesBridge = require('../departments-subagents/operations/hermes/src/HermesBridge');

const VALID = {
  agent: 'hermes',
  type: 'cron_create',
  project: 'test-project',
  goal: 'schedule a job',
  task: 'create a cron job',
  approved_by: 'ceo_agent',
};

const GATEWAY_URL = process.env.HERMES_GATEWAY_URL;
const GATEWAY_KEY = process.env.HERMES_GATEWAY_API_KEY;
const INTEGRATION_ENABLED = Boolean(GATEWAY_URL && GATEWAY_KEY && GATEWAY_KEY.length >= 16);

if (!INTEGRATION_ENABLED) {
  console.log('[HermesIntegration] Skipping — HERMES_GATEWAY_URL and/or HERMES_GATEWAY_API_KEY not set or key too short');
}

test('INTEGRATION: live POST /v1/runs round-trip returns triggered with run_id', { skip: !INTEGRATION_ENABLED }, async () => {
  const bridge = new HermesBridge();
  const result = await bridge.runTask(VALID);

  assert.equal(result.status, 'triggered', `expected 'triggered', got '${result.status}': ${JSON.stringify(result)}`);
  assert.ok(result.run_id && typeof result.run_id === 'string' && result.run_id.startsWith('run_'), 'run_id must be present and match run_* pattern');
  assert.equal(result.gateway_status, 'started');
  assert.ok(result.actions_taken.includes('Submitted task to Hermes gateway POST /v1/runs.'));
});

test('INTEGRATION: awaitRun() follows the run to a terminal status', { skip: !INTEGRATION_ENABLED }, async () => {
  const bridge = new HermesBridge();
  const submitResult = await bridge.runTask(VALID);

  assert.equal(submitResult.status, 'triggered');
  assert.ok(submitResult.run_id);

  const resolution = await bridge.awaitRun(submitResult.run_id, {
    runTimeoutMs: 120000,
    approvalTimeoutMs: 60000,
    pollIntervalMs: 2000,
  });

  assert.ok(['completed', 'failed', 'cancelled'].includes(resolution.status), `unexpected resolution status: ${resolution.status}`);
  assert.ok(resolution.lastPoll && typeof resolution.lastPoll === 'object');
  if (resolution.status === 'failed') {
    assert.ok(resolution.reason && typeof resolution.reason === 'string');
  }
});
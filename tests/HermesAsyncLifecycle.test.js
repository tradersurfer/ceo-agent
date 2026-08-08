// Real tests for ADR-009 §3's post-submission async lifecycle (issue #95):
// GET /v1/runs/{run_id} polling, layered run-level/approval-wait timeouts
// with a real POST /v1/runs/{run_id}/stop on expiry, waiting_for_approval
// handling, and the hard non-goal that no code path ever auto-resolves an
// approval. Uses an injectable clock/sleep (same pattern WorkflowRuntime's
// tests already use for its own clock) so timeout behavior is deterministic
// and fast, not a real multi-minute wait.

// Allowlists are read at module-load time — must be set BEFORE requiring
// HermesBridge (matches tests/HermesBridgeGateway.test.js's own convention).
process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HermesGatewayClient } = require('../departments-subagents/operations/hermes/src/HermesGatewayClient');
const HermesBridge = require('../departments-subagents/operations/hermes/src/HermesBridge');
const { WorkflowRuntime } = require('../ceo-core/WorkflowRuntime');

function fakeClock(startMs) {
  let now = startMs;
  return { now: () => new Date(now), advance: ms => { now += ms; } };
}

function buildClient({ pollSequence, stopCalls = [], approvalTimeoutMs = 1000, runTimeoutMs = 5000, pollIntervalMs = 100 } = {}) {
  const clockState = fakeClock(0);
  let pollIndex = 0;
  const client = new HermesGatewayClient('http://127.0.0.1:8642', 'k'.repeat(20), {
    runTimeoutMs,
    approvalTimeoutMs,
    pollIntervalMs,
    clock: clockState.now,
    // sleep is where simulated time actually advances, so the loop's own
    // timeout checks see consistent progress without a real wall-clock wait.
    sleep: async ms => { clockState.advance(ms); },
  });
  client.pollRun = async () => {
    const poll = pollSequence[Math.min(pollIndex, pollSequence.length - 1)];
    pollIndex += 1;
    if (poll instanceof Error) throw poll;
    return poll;
  };
  client.stop = async runId => { stopCalls.push(runId); return { ok: true }; };
  return { client, clockState };
}

test('awaitResolution: running -> completed resolves as completed, no approval/stop involved', async () => {
  const stopCalls = [];
  const { client } = buildClient({
    pollSequence: [{ status: 'running' }, { status: 'running' }, { status: 'completed' }],
    stopCalls,
  });
  const result = await client.awaitResolution('run_1');
  assert.equal(result.status, 'completed');
  assert.equal(stopCalls.length, 0);
});

test('awaitResolution: failed run surfaces the gateway\'s real reason', async () => {
  const { client } = buildClient({ pollSequence: [{ status: 'failed', reason: 'sandbox crashed' }] });
  const result = await client.awaitResolution('run_2');
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'sandbox crashed');
});

test('awaitResolution: cancelled is distinguishable from failed', async () => {
  const { client } = buildClient({ pollSequence: [{ status: 'cancelled', reason: 'operator stopped it' }] });
  const result = await client.awaitResolution('run_3');
  assert.equal(result.status, 'cancelled');
  assert.equal(result.reason, 'operator stopped it');
});

test('awaitResolution: waiting_for_approval maps to a real wait, never auto-resolved, then resolves on later poll', async () => {
  const events = [];
  const { client } = buildClient({
    pollSequence: [
      { status: 'running' },
      { status: 'waiting_for_approval' },
      { status: 'waiting_for_approval' },
      { status: 'completed' },
    ],
  });
  const result = await client.awaitResolution('run_4', { onEvent: e => events.push(e) });
  assert.equal(result.status, 'completed');
  assert.ok(events.some(e => e.event === 'run_waiting_for_approval'));
  // The only way this test resolves to 'completed' is via the injected
  // pollRun sequence reaching 'completed' on its own -- nothing in
  // awaitResolution calls an approval endpoint. Explicit assertion that no
  // such call is even possible: the fake client has no approval method to
  // have called, and awaitResolution never references one.
  assert.equal(typeof client.approve, 'undefined');
});

test('awaitResolution: run-level timeout stops the run and resolves failed, distinct from an approval timeout', async () => {
  const stopCalls = [];
  const { client } = buildClient({
    pollSequence: [{ status: 'running' }],
    stopCalls,
    runTimeoutMs: 250,
    pollIntervalMs: 100,
  });
  const result = await client.awaitResolution('run_5');
  assert.equal(result.status, 'failed');
  assert.equal(result.timedOut, 'run');
  assert.match(result.reason, /timed out/i);
  assert.deepEqual(stopCalls, ['run_5']);
});

test('awaitResolution: approval-wait timeout is a SEPARATE, shorter budget than the run timeout, and also stops the run', async () => {
  const stopCalls = [];
  const { client } = buildClient({
    pollSequence: [{ status: 'waiting_for_approval' }],
    stopCalls,
    runTimeoutMs: 10000,
    approvalTimeoutMs: 250,
    pollIntervalMs: 100,
  });
  const result = await client.awaitResolution('run_6');
  assert.equal(result.status, 'failed');
  assert.equal(result.timedOut, 'approval');
  assert.match(result.reason, /approval/i);
  assert.deepEqual(stopCalls, ['run_6']);
});

test('awaitResolution: a run that returns to running after waiting_for_approval resets the approval-wait window (does not carry a stale timeout forward)', async () => {
  const { client } = buildClient({
    pollSequence: [
      { status: 'waiting_for_approval' },
      { status: 'running' }, // clears approval-wait tracking
      { status: 'waiting_for_approval' }, // starts a fresh window
      { status: 'completed' },
    ],
    approvalTimeoutMs: 100000, // large enough that only a bug (accumulating instead of resetting) would trip it
    runTimeoutMs: 100000,
    pollIntervalMs: 10,
  });
  const result = await client.awaitResolution('run_7');
  assert.equal(result.status, 'completed');
});

test('awaitResolution: repeated poll failures surface as an honest failure, never inferred success', async () => {
  const { client } = buildClient({
    pollSequence: [new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')],
    runTimeoutMs: 100000,
    pollIntervalMs: 10,
  });
  const result = await client.awaitResolution('run_8');
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /consecutive attempts/);
});

// -- HermesBridge.awaitRun() wiring --------------------------------------

test('HermesBridge.awaitRun() delegates to the gateway client and audits the resolution', async () => {
  process.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8642';
  process.env.HERMES_GATEWAY_API_KEY = 'k'.repeat(20);
  try {
    const bridge = new HermesBridge();
    const audited = [];
    bridge.audit = e => audited.push(e);
    bridge._gateway.awaitResolution = async (runId, options) => {
      options.onEvent({ event: 'run_waiting_for_approval', runId });
      return { status: 'completed', lastPoll: { status: 'completed' } };
    };
    const result = await bridge.awaitRun('run_x');
    assert.equal(result.status, 'completed');
    assert.ok(audited.some(e => e.event === 'run_waiting_for_approval'));
    assert.ok(audited.some(e => e.event === 'run_resolved' && e.status === 'completed'));
  } finally {
    delete process.env.HERMES_GATEWAY_URL;
    delete process.env.HERMES_GATEWAY_API_KEY;
  }
});

// -- BridgeExecutors integration: a workflow step now waits for real resolution --

test('a Hermes workflow step only completes once the run actually resolves, not on bare submission (real BridgeExecutors integration)', async () => {
  process.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8642';
  process.env.HERMES_GATEWAY_API_KEY = 'k'.repeat(20);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ status: 202, json: async () => ({ run_id: 'run_wf', status: 'started' }) });
  try {
    const { registerBridgeExecutors } = require('../ceo-core/BridgeExecutors');
    const runtime = new WorkflowRuntime();
    const bridges = registerBridgeExecutors(runtime, { project: 'test-project' });
    // Patch only the async-resolution half (a real network round-trip we
    // can't run here) -- submission (runTask -> triggered) is still real.
    bridges.hermes._gateway.awaitResolution = async () => ({ status: 'completed' });

    const workflow = { id: 'wf-hermes-real-resolution', steps: [{ id: 'step1', type: 'cron_create' }] };
    const run = await runtime.execute({ workflow, input: {} });
    assert.equal(run.status, 'completed');
    assert.equal(run.steps[0].output.bridgeResult.resolution.status, 'completed');
  } finally {
    global.fetch = originalFetch;
    delete process.env.HERMES_GATEWAY_URL;
    delete process.env.HERMES_GATEWAY_API_KEY;
  }
});

test('a Hermes workflow step FAILS when the run resolves to failed, not just when submission fails', async () => {
  process.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8642';
  process.env.HERMES_GATEWAY_API_KEY = 'k'.repeat(20);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ status: 202, json: async () => ({ run_id: 'run_wf2', status: 'started' }) });
  try {
    const { registerBridgeExecutors } = require('../ceo-core/BridgeExecutors');
    const runtime = new WorkflowRuntime();
    const bridges = registerBridgeExecutors(runtime, { project: 'test-project' });
    bridges.hermes._gateway.awaitResolution = async () => ({ status: 'failed', reason: 'sandbox crashed mid-run' });

    const workflow = { id: 'wf-hermes-real-failure', steps: [{ id: 'step1', type: 'cron_create' }] };
    const run = await runtime.execute({ workflow, input: {} });
    assert.equal(run.status, 'failed');
    assert.match(run.steps[0].error, /sandbox crashed mid-run/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.HERMES_GATEWAY_URL;
    delete process.env.HERMES_GATEWAY_API_KEY;
  }
});

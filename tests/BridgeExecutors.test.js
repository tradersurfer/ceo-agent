// Bridges read their allowlists from env vars at module-load time, so these
// must be set BEFORE requiring core/BridgeExecutors (which requires the bridges).
process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';
process.env.SALES_INTAKE_AGENT_URL = 'https://example.test';
process.env.SALES_INTAKE_AGENT_SECRET = 'test-secret';
// Deliberately leave ONBOARDING_COMMS_AGENT_URL and DISPUTE_AGENT_URL unset
// to test the "validated but not configured" (queued -> workflow failure) path.

const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime } = require('../ceo-core/WorkflowRuntime');
const { registerBridgeExecutors } = require('../ceo-core/BridgeExecutors');

test('registers an executor for every allowed task type across all four bridges', () => {
  const runtime = new WorkflowRuntime();
  const bridges = registerBridgeExecutors(runtime);
  // Hermes is now the fourth registered bridge (issue #27).
  assert.ok(bridges.hermes, 'Expected Hermes to be one of the registered bridges');
  for (const bridge of Object.values(bridges)) {
    for (const taskType of bridge.allowedTaskTypes) {
      assert.ok(runtime.executors.has(taskType), `Expected executor registered for ${taskType}`);
    }
  }
  // Explicitly assert Hermes task types are registered — previously they were not.
  for (const taskType of bridges.hermes.allowedTaskTypes) {
    assert.ok(runtime.executors.has(taskType), `Expected Hermes executor registered for ${taskType}`);
  }
  assert.ok(runtime.executors.has('cron_create'), 'Expected Hermes cron_create executor registered');
});

test('a validated Hermes workflow step is a workflow failure, not a false success (validated but not executed)', async () => {
  const runtime = new WorkflowRuntime();
  registerBridgeExecutors(runtime, { project: 'test-project' });
  // Hermes validates successfully (project is allowlisted) but returns 'queued'
  // because it does not execute an external runtime — this must NOT be reported
  // as workflow success.
  const workflow = { id: 'wf-hermes-unexecuted', steps: [{ id: 'step1', type: 'cron_create' }] };
  const run = await runtime.execute({ workflow, input: {} });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
});

test('a configured bridge with a successful fetch response completes the workflow step', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ leadId: 'abc123' }) });

  try {
    const runtime = new WorkflowRuntime();
    registerBridgeExecutors(runtime, { project: 'test-project' });
    const workflow = { id: 'wf-lead', steps: [{ id: 'step1', type: 'create_lead' }] };
    const run = await runtime.execute({ workflow, input: { name: 'Test Lead' } });
    assert.equal(run.status, 'completed');
    assert.equal(run.steps[0].status, 'completed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a project outside the allowlist blocks the workflow step at validation', async () => {
  const runtime = new WorkflowRuntime();
  registerBridgeExecutors(runtime, { project: 'unauthorized-project' });
  const workflow = { id: 'wf-lead-bad-project', steps: [{ id: 'step1', type: 'create_lead' }] };
  const run = await runtime.execute({ workflow, input: {} });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
  assert.match(run.steps[0].error, /project/i);
});

test('a validated task with no runtime URL configured is treated as a workflow failure, not a false success', async () => {
  const runtime = new WorkflowRuntime();
  registerBridgeExecutors(runtime, { project: 'test-project' });
  // dispute_generate belongs to dispute_agent, which has no DISPUTE_AGENT_URL
  // set in this test — the bridge will validate successfully but return
  // status 'queued', which must NOT be reported as workflow success.
  const workflow = { id: 'wf-dispute-unconfigured', steps: [{ id: 'step1', type: 'dispute_generate' }] };
  const run = await runtime.execute({ workflow, input: {} });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
});

test('a failed fetch response is treated as a workflow failure', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'server error' }) });

  try {
    const runtime = new WorkflowRuntime();
    registerBridgeExecutors(runtime, { project: 'test-project' });
    const workflow = { id: 'wf-lead-server-error', steps: [{ id: 'step1', type: 'create_lead' }] };
    const run = await runtime.execute({ workflow, input: {} });
    assert.equal(run.status, 'failed');
  } finally {
    global.fetch = originalFetch;
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime } = require('../core/WorkflowRuntime');
const { SupabaseWorkflowStore } = require('../core/persistence/SupabaseWorkflowStore');
const { SupabaseAuditLog } = require('../core/persistence/SupabaseAuditLog');
const { createWorkflowPersistence } = require('../core/persistence');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');

test('WorkflowRuntime runs end-to-end on the Supabase store + audit doubles', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const audit = new SupabaseAuditLog({ supabase });
  const runtime = new WorkflowRuntime({ store, audit });
  runtime.registerExecutor('noop', async () => ({ status: 'ok', value: 42 }));

  const run = await runtime.execute({
    workflow: { id: 'wf', steps: [{ id: 's1', type: 'noop' }] },
    input: { hello: 'world' },
    context: { tenantId: 't1', agentId: 'hermes' },
  });

  assert.equal(run.status, 'completed');
  assert.equal(run.steps[0].status, 'completed');

  // The run persisted through the Supabase store and is retrievable by id.
  const persisted = await store.get(run.id);
  assert.equal(persisted.status, 'completed');
  assert.equal(persisted.outputs.s1.value, 42);
});

test('audit persisted through Supabase is queryable by run, tenant, and agent', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const audit = new SupabaseAuditLog({ supabase });
  const runtime = new WorkflowRuntime({ store, audit });
  runtime.registerExecutor('noop', async () => ({ status: 'ok' }));

  const run = await runtime.execute({
    workflow: { id: 'wf', steps: [{ id: 's1', type: 'noop' }] },
    context: { tenantId: 't1', agentId: 'hermes' },
  });

  const byRun = await audit.query({ runId: run.id });
  assert.ok(byRun.length >= 2, 'expected step + workflow completion events');
  assert.ok(byRun.some(r => r.event === 'workflow.completed'));

  // The tenant/agent dimensions carried from run context are queryable.
  assert.ok((await audit.query({ tenantId: 't1' })).length >= 1);
  const byAgent = await audit.query({ agentId: 'hermes' });
  assert.ok(byAgent.length >= 1);
  assert.equal(byAgent[0].tenant_id, 't1');
});

test('resume() reads the persisted run back from the Supabase store', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const audit = new SupabaseAuditLog({ supabase });
  let now = new Date('2026-07-25T00:00:00.000Z');
  const runtime = new WorkflowRuntime({ store, audit, clock: () => now });
  runtime.registerExecutor('noop', async () => ({ status: 'ok' }));

  const workflow = { id: 'wf', steps: [{ id: 's1', type: 'noop', delay_minutes: 10 }] };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'waiting');

  now = new Date('2026-07-25T00:11:00.000Z');
  const resumed = await runtime.resume(run.id, workflow);
  assert.equal(resumed.status, 'completed');
});

test('createWorkflowPersistence returns null without Supabase credentials', () => {
  assert.equal(createWorkflowPersistence({}), null);
  assert.equal(createWorkflowPersistence({ SUPABASE_URL: 'http://x' }), null);
});

test('createWorkflowPersistence builds a store + audit when credentials are present', () => {
  const persistence = createWorkflowPersistence({
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });
  assert.ok(persistence);
  assert.ok(persistence.store instanceof SupabaseWorkflowStore);
  assert.ok(persistence.audit instanceof SupabaseAuditLog);
});

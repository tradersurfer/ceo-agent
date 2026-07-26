const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseAuditLog } = require('../core/persistence/SupabaseAuditLog');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');

function entry(overrides = {}) {
  return {
    event: 'workflow.step.completed',
    workflowId: 'wf',
    runId: 'wf:1',
    stepId: 's1',
    tenantId: 'tenant-a',
    agentId: 'hermes',
    timestamp: '2026-07-25T00:00:00.000Z',
    output: { ok: true },
    ...overrides,
  };
}

test('append persists a normalized audit row', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  await audit.append(entry());

  const rows = supabase._rows('workflow_audit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'workflow.step.completed');
  assert.equal(rows[0].workflow_id, 'wf');
  assert.equal(rows[0].run_id, 'wf:1');
  assert.equal(rows[0].step_id, 's1');
  assert.equal(rows[0].tenant_id, 'tenant-a');
  assert.equal(rows[0].agent_id, 'hermes');
  assert.equal(rows[0].event_time, '2026-07-25T00:00:00.000Z');
  // Non-envelope fields land in data.
  assert.deepEqual(rows[0].data, { output: { ok: true } });
});

test('append supplies a timestamp when the entry has none', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  await audit.append({ event: 'workflow.completed', workflowId: 'wf', runId: 'wf:1' });
  assert.ok(supabase._rows('workflow_audit')[0].event_time);
});

test('query filters by run, workflow, tenant, and agent', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  await audit.append(entry({ runId: 'wf:1', tenantId: 'tenant-a', agentId: 'hermes' }));
  await audit.append(entry({ runId: 'wf:2', tenantId: 'tenant-b', agentId: 'cfo_agent' }));

  assert.equal((await audit.query({ runId: 'wf:1' })).length, 1);
  assert.equal((await audit.query({ tenantId: 'tenant-b' })).length, 1);
  assert.equal((await audit.query({ agentId: 'hermes' }))[0].run_id, 'wf:1');
  assert.equal((await audit.query({ workflowId: 'wf' })).length, 2);
  assert.equal((await audit.query({ tenantId: 'tenant-c' })).length, 0);
});

test('query filters by date range and orders oldest first', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  await audit.append(entry({ stepId: 'early', timestamp: '2026-07-24T00:00:00.000Z' }));
  await audit.append(entry({ stepId: 'mid', timestamp: '2026-07-25T00:00:00.000Z' }));
  await audit.append(entry({ stepId: 'late', timestamp: '2026-07-26T00:00:00.000Z' }));

  const inWindow = await audit.query({ since: '2026-07-24T12:00:00.000Z', until: '2026-07-25T12:00:00.000Z' });
  assert.deepEqual(inWindow.map(r => r.step_id), ['mid']);

  const all = await audit.query({});
  assert.deepEqual(all.map(r => r.step_id), ['early', 'mid', 'late']);
});

test('query honors the limit', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  for (let i = 0; i < 5; i++) await audit.append(entry({ stepId: `s${i}`, timestamp: `2026-07-2${i}T00:00:00.000Z` }));
  assert.equal((await audit.query({ limit: 2 })).length, 2);
});

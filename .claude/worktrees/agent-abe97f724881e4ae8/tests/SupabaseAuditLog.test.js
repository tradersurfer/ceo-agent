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

function skillEntry(overrides = {}) {
  return {
    event: 'skill.execution.succeeded',
    skillName: 'generate_pdf',
    agentId: 'cmo_agent',
    status: 'ok',
    reason: null,
    tenantId: 'tenant-a',
    timestamp: '2026-07-27T00:00:00.000Z',
    ...overrides,
  };
}

test('a skill_audit-configured instance writes skill-shaped columns to its own table', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase, table: 'skill_audit', entryColumns: ['skillName', 'status', 'reason'] });
  await audit.append(skillEntry());

  // Nothing leaked into workflow_audit.
  assert.equal(supabase._rows('workflow_audit').length, 0);

  const rows = supabase._rows('skill_audit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'skill.execution.succeeded');
  assert.equal(rows[0].skill_name, 'generate_pdf');
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[0].reason, null);
  assert.equal(rows[0].tenant_id, 'tenant-a');
  assert.equal(rows[0].agent_id, 'cmo_agent');
  // No workflow-shaped columns on a skill_audit row.
  assert.equal('workflow_id' in rows[0], false);
  assert.equal('run_id' in rows[0], false);
  assert.equal('step_id' in rows[0], false);
  assert.deepEqual(rows[0].data, {});
});

test('skill_audit query filters by skillName and status', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase, table: 'skill_audit', entryColumns: ['skillName', 'status', 'reason'] });
  await audit.append(skillEntry({ skillName: 'generate_pdf', status: 'ok' }));
  await audit.append(skillEntry({ skillName: 'generate_docx', status: 'failed', reason: 'timeout' }));

  assert.equal((await audit.query({ skillName: 'generate_pdf' })).length, 1);
  assert.equal((await audit.query({ status: 'failed' }))[0].skill_name, 'generate_docx');
  assert.equal((await audit.query({ tenantId: 'tenant-a' })).length, 2);
});

test('a workflow_audit instance and a skill_audit instance sharing one client stay isolated by table', async () => {
  const supabase = makeFakeSupabase();
  const workflowAudit = new SupabaseAuditLog({ supabase });
  const skillAudit = new SupabaseAuditLog({ supabase, table: 'skill_audit', entryColumns: ['skillName', 'status', 'reason'] });

  await workflowAudit.append(entry());
  await skillAudit.append(skillEntry());

  assert.equal((await workflowAudit.query({})).length, 1);
  assert.equal((await skillAudit.query({})).length, 1);
  assert.equal(supabase._rows('workflow_audit').length, 1);
  assert.equal(supabase._rows('skill_audit').length, 1);
});

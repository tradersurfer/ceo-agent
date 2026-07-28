const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime, InMemoryAuditLog } = require('../core/WorkflowRuntime');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerExampleSkills } = require('../core/skills/exampleSkills');
const { SupabaseAuditLog } = require('../core/persistence/SupabaseAuditLog');
const { SupabaseWorkflowStore } = require('../core/persistence/SupabaseWorkflowStore');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');
const { recordUsage } = require('../core/UsageTracker');
const {
  buildActivityFeed,
  buildAgentDirectory,
  resolveAgent,
  normalizeEntry,
  buildSkillActivity,
  buildWorkflowActivity,
  buildUsageActivity,
  buildDepartmentSummary,
} = require('../lib/activityFeed');

function fakeSupervisor(agents) {
  return { listAgents: () => agents };
}

const AGENTS = [
  { id: 'cfo_agent', name: 'CFO Agent', title: 'Chief Financial Officer', department: 'finance' },
  { id: 'coo_agent', name: 'COO Agent', title: 'Chief Operating Officer', department: 'operations' },
];

function makeRuntime({ store, audit, skillAudit, usageAudit, agents = AGENTS } = {}) {
  const workflowRuntime = new WorkflowRuntime({ store: store || undefined, audit: audit || undefined });
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  const skillExecutor = new SkillExecutor(registry, { audit: skillAudit || undefined });
  return {
    workflowRuntime,
    skillExecutor,
    usageAudit: usageAudit || new InMemoryAuditLog(),
    supervisor: fakeSupervisor(agents),
  };
}

test('no runtime configured returns configured:false without crashing', async () => {
  const feed = await buildActivityFeed({ runtime: null });
  assert.equal(feed.configured, false);
  assert.ok(feed.generatedAt);
});

test('buildAgentDirectory resolves department from agent.department, falling back to lane', () => {
  const directory = buildAgentDirectory(fakeSupervisor([
    { id: 'a1', name: 'Agent One', title: 'T', department: 'finance' },
    { id: 'a2', name: 'Agent Two', title: 'T', lane: 'legal' },
    { id: 'a3' }, // no id-bearing garbage should not crash
  ]));
  assert.equal(directory.a1.department, 'finance');
  assert.equal(directory.a2.department, 'legal');
});

test('buildAgentDirectory tolerates a missing/malformed supervisor', () => {
  assert.deepEqual(buildAgentDirectory(null), {});
  assert.deepEqual(buildAgentDirectory({}), {});
});

test('resolveAgent renders gracefully for an unresolvable agentId (removed/renamed agent)', () => {
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));
  const resolved = resolveAgent(directory, 'ghost_agent');
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.name, 'ghost_agent');
  assert.equal(resolved.department, null);
});

test('resolveAgent handles a null/absent agentId without crashing', () => {
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));
  const resolved = resolveAgent(directory, null);
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.name, 'Unknown');
});

test('normalizeEntry reconstructs camelCase fields from a Supabase-shaped row (skill_audit)', () => {
  const supabaseRow = {
    event: 'skill.execution.succeeded',
    tenant_id: null,
    agent_id: 'cfo_agent',
    event_time: '2026-07-28T00:00:00.000Z',
    skill_name: 'format_currency',
    status: 'ok',
    reason: null,
    data: {},
  };
  const normalized = normalizeEntry(supabaseRow);
  assert.equal(normalized.agentId, 'cfo_agent');
  assert.equal(normalized.skillName, 'format_currency');
  assert.equal(normalized.timestamp, '2026-07-28T00:00:00.000Z');
  assert.equal(normalized.status, 'ok');
});

test('normalizeEntry passes an already-flat in-memory entry through unchanged', () => {
  const entry = { event: 'skill.execution.failed', agentId: 'coo_agent', skillName: 'summarize_text', status: 'failed', reason: 'input_validation', timestamp: '2026-07-28T00:00:00.000Z' };
  const normalized = normalizeEntry(entry);
  assert.equal(normalized.agentId, 'coo_agent');
  assert.equal(normalized.skillName, 'summarize_text');
  assert.equal(normalized.status, 'failed');
});

test('buildSkillActivity handles a missing audit log without crashing', async () => {
  const summary = await buildSkillActivity(null, {}, 50);
  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.errorRate, null);
  assert.deepEqual(summary.recent, []);
});

test('buildSkillActivity computes who/what/status/when and an error rate from real in-memory skill_audit', async () => {
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  const executor = new SkillExecutor(registry);
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));

  await executor.run('format_currency', { amount: 5 }, undefined, { agentId: 'cfo_agent' });
  await executor.run('summarize_text', {}, undefined, { agentId: 'coo_agent' }); // input validation failure
  await executor.run('format_currency', { amount: 9 }, undefined, {}); // no agentId -- must not crash or be dropped

  const summary = await buildSkillActivity(executor.audit, directory, 50);
  assert.equal(summary.source, 'in-memory');
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.errorRate, Number((1 / 3).toFixed(4)));
  // most-recent first
  assert.equal(summary.recent[0].skillName, 'format_currency');
  const coo = summary.recent.find(item => item.skillName === 'summarize_text');
  assert.equal(coo.agentName, 'COO Agent');
  assert.equal(coo.department, 'operations');
  assert.equal(coo.status, 'failed');
  const noAgent = summary.recent.find(item => item.agentId == null);
  assert.equal(noAgent.agentName, 'Unknown');
});

test('buildSkillActivity reads a Supabase-backed skill_audit table and resolves agent identity', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase, table: 'skill_audit', entryColumns: ['skillName', 'status', 'reason'] });
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));

  await audit.append({ event: 'skill.execution.succeeded', skillName: 'format_currency', agentId: 'cfo_agent', status: 'ok', reason: null });
  await audit.append({ event: 'skill.execution.failed', skillName: 'summarize_text', agentId: 'unknown_agent', status: 'failed', reason: 'timeout' });

  const summary = await buildSkillActivity(audit, directory, 50);
  assert.equal(summary.source, 'supabase');
  assert.equal(summary.sampleSize, 2);
  assert.equal(summary.failureCount, 1);
  const ghost = summary.recent.find(item => item.skillName === 'summarize_text');
  assert.equal(ghost.agentResolved, false);
  assert.equal(ghost.agentName, 'unknown_agent');
});

test('buildWorkflowActivity computes an error rate from run-terminal events only, not raw step-event counts', async () => {
  const workflowRuntime = new WorkflowRuntime();
  workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  workflowRuntime.registerExecutor('bad', async () => ({ status: 'failed', error: 'boom' }));
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));

  await workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] }, context: { agentId: 'cfo_agent' } });
  await workflowRuntime.execute({ workflow: { id: 'wf-b', steps: [{ id: 's1', type: 'bad' }] }, context: { agentId: 'coo_agent' } });

  const summary = await buildWorkflowActivity(workflowRuntime.audit, workflowRuntime.store, directory, 50);
  assert.equal(summary.source, 'in-memory');
  // 1 workflow.completed + 1 workflow.failed => run-terminal denominator is 2, not the full event-row count.
  assert.equal(summary.runTerminalCount, 2);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.errorRate, 0.5);
  assert.ok(summary.sampleSize > summary.runTerminalCount, 'sampleSize includes step-level rows the error-rate denominator excludes');
});

test('buildWorkflowActivity derives run-level duration from the run record, not a fabricated per-step figure', async () => {
  const workflowRuntime = new WorkflowRuntime();
  workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));

  await workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] }, context: { agentId: 'cfo_agent' } });

  const summary = await buildWorkflowActivity(workflowRuntime.audit, workflowRuntime.store, directory, 50);
  assert.equal(summary.runs.length, 1);
  assert.equal(summary.runs[0].status, 'completed');
  assert.equal(typeof summary.runs[0].durationMs, 'number');
  assert.ok(summary.runs[0].durationMs >= 0);
});

test('buildWorkflowActivity handles a missing audit/store without crashing', async () => {
  const summary = await buildWorkflowActivity(null, null, {}, 50);
  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.errorRate, null);
  assert.deepEqual(summary.runs, []);
});

test('buildUsageActivity aggregates cost per agent, treating null estimatedCostUsd as unknown, never a fake 0', async () => {
  const audit = new InMemoryAuditLog();
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));

  await recordUsage(audit, { model: 'anthropic/claude-opus-5', agentId: 'cfo_agent', usage: { promptTokens: 1000, completionTokens: 500 }, pricing: { prompt: 0.000003, completion: 0.000015 } });
  await recordUsage(audit, { model: 'openai/gpt-6-pro', agentId: 'cfo_agent', usage: { promptTokens: 200, completionTokens: 100 }, pricing: null });
  await recordUsage(audit, { model: 'anthropic/claude-opus-5', agentId: 'coo_agent', usage: { promptTokens: 300, completionTokens: 150 }, pricing: { prompt: 0.000003, completion: 0.000015 } });

  const summary = await buildUsageActivity(audit, directory, 50);
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.costUnknownCalls, 1);
  assert.equal(summary.byAgent.cfo_agent.calls, 2);
  assert.equal(summary.byAgent.cfo_agent.costUnknownCalls, 1);
  assert.equal(summary.byAgent.coo_agent.calls, 1);
  assert.equal('errorRate' in summary, false, 'model_usage aggregation must never carry an error rate -- see lib/activityFeed.js header');
});

test('buildUsageActivity handles a missing audit log without crashing', async () => {
  const summary = await buildUsageActivity(null, {}, 50);
  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.totalCostUsd, 0);
});

test('buildDepartmentSummary marks a department working only within the recency window, with a highlight from the most recent item', async () => {
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));
  const now = new Date('2026-07-28T12:00:00.000Z').getTime();

  const skills = {
    recent: [
      { agentId: 'cfo_agent', agentName: 'CFO Agent', department: 'finance', skillName: 'format_currency', status: 'ok', timestamp: new Date(now - 30_000).toISOString() },
    ],
  };
  const workflows = {
    recent: [
      { agentId: 'coo_agent', agentName: 'COO Agent', department: 'operations', event: 'workflow.step.completed', timestamp: new Date(now - 3_600_000).toISOString() },
    ],
  };

  const byDept = buildDepartmentSummary({ directory, skills, workflows, now, windowMs: 5 * 60 * 1000 });
  assert.equal(byDept.finance.working, true);
  assert.match(byDept.finance.highlight, /CFO Agent ran format_currency/);
  assert.equal(byDept.operations.working, false, 'an hour-old event is outside the 5-minute recency window');
  assert.ok(byDept.operations.highlight);
});

test('buildDepartmentSummary represents every department with an agent, even with zero recent activity', () => {
  const directory = buildAgentDirectory(fakeSupervisor(AGENTS));
  const byDept = buildDepartmentSummary({ directory, skills: { recent: [] }, workflows: { recent: [] }, now: Date.now(), windowMs: 300000 });
  assert.equal(byDept.finance.working, false);
  assert.equal(byDept.finance.highlight, null);
  assert.equal(byDept.finance.agentCount, 1);
  assert.equal(byDept.operations.agentCount, 1);
});

test('full feed is real end-to-end with in-memory backends: skill, workflow, usage, and department overlay all present', async () => {
  const runtime = makeRuntime({});
  runtime.workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  await runtime.workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] }, context: { agentId: 'cfo_agent' } });
  await runtime.skillExecutor.run('format_currency', { amount: 5 }, undefined, { agentId: 'coo_agent' });
  await recordUsage(runtime.usageAudit, { model: 'anthropic/claude-opus-5', agentId: 'cfo_agent', usage: { promptTokens: 100, completionTokens: 50 }, pricing: { prompt: 0.000003, completion: 0.000015 } });

  const feed = await buildActivityFeed({ runtime });
  assert.equal(feed.configured, true);
  assert.equal(feed.skills.sampleSize, 1);
  assert.equal(feed.workflows.runTerminalCount, 1);
  assert.equal(feed.usage.sampleSize, 1);
  assert.ok(feed.byDepartment.finance);
  assert.ok(feed.byDepartment.operations);
  assert.ok(feed.notes.duration);
  assert.ok(feed.notes.errorRate);
  assert.ok(feed.notes.working);
});

test('full feed round-trips through real Supabase-shaped backends (workflow store + all three audit tables)', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const audit = new SupabaseAuditLog({ supabase });
  const skillAudit = new SupabaseAuditLog({ supabase, table: 'skill_audit', entryColumns: ['skillName', 'status', 'reason'] });
  const usageAudit = new SupabaseAuditLog({ supabase, table: 'model_usage', entryColumns: ['model', 'role', 'costTier'] });

  const runtime = makeRuntime({ store, audit, skillAudit, usageAudit });
  runtime.workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  await runtime.workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] }, context: { agentId: 'cfo_agent' } });
  await runtime.skillExecutor.run('format_currency', { amount: 5 }, undefined, { agentId: 'coo_agent' });
  await recordUsage(runtime.usageAudit, { model: 'anthropic/claude-opus-5', agentId: 'cfo_agent', usage: { promptTokens: 100, completionTokens: 50 }, pricing: { prompt: 0.000003, completion: 0.000015 } });

  const feed = await buildActivityFeed({ runtime });
  assert.equal(feed.skills.source, 'supabase');
  assert.equal(feed.workflows.source, 'supabase');
  assert.equal(feed.usage.source, 'supabase');
  assert.equal(feed.skills.sampleSize, 1);
  assert.equal(feed.workflows.runTerminalCount, 1);
  assert.equal(feed.workflows.runs.length, 1);
  assert.equal(feed.workflows.runs[0].status, 'completed');
  assert.equal(feed.usage.sampleSize, 1);
});

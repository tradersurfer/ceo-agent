const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime, InMemoryAuditLog } = require('../ceo-core/WorkflowRuntime');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerExampleSkills } = require('../ceo-core/skills/exampleSkills');
const ModelBroker = require('../ceo-core/ModelBroker');
const { SupabaseAuditLog } = require('../ceo-core/persistence/SupabaseAuditLog');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');
const { getHealthReport, summarizeAudit, buildRouting } = require('../ceo-core/HealthReporter');
const { recordUsage } = require('../ceo-core/UsageTracker');

function makeRuntime({ store = null, audit = null, skillAudit = null, usageAudit = null, models = [] } = {}) {
  const workflowRuntime = new WorkflowRuntime({ store: store || undefined, audit: audit || undefined });
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  const skillExecutor = new SkillExecutor(registry, { audit: skillAudit || undefined });
  const modelBroker = new ModelBroker(models);
  return { workflowRuntime, skillExecutor, modelBroker, usageAudit: usageAudit || new InMemoryAuditLog() };
}

const UNRESOLVED_MODELS = [
  { id: 'claude', role: 'claude', apiModelId: null },
  { id: 'hermes', role: 'hermes', apiModelId: 'local' },
];

const RESOLVED_MODELS = [
  {
    id: 'claude', role: 'claude',
    tiers: { flagship: { apiModelId: 'anthropic/claude-opus-5' }, efficient: { apiModelId: 'anthropic/claude-haiku-4.5' } },
    apiModelId: 'anthropic/claude-opus-5',
    resolvedAt: '2026-07-26T00:00:00.000Z',
  },
  { id: 'hermes', role: 'hermes', apiModelId: 'local' },
];

test('no runtime configured reports unhealthy with a reason, no crash', async () => {
  const report = await getHealthReport({ runtime: null });
  assert.equal(report.status, 'unhealthy');
  assert.equal(report.readiness.ready, false);
  assert.match(report.readiness.reason, /Run setup first/);
  assert.equal(report.liveness.up, true);
});

test('liveness reports the process is up with a real uptime', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  const report = await getHealthReport({ runtime, env: {} });
  assert.equal(report.liveness.up, true);
  assert.ok(report.liveness.uptimeSeconds >= 0);
});

test('Supabase not configured degrades gracefully to healthy in-memory mode, not a failure', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  const report = await getHealthReport({ runtime, env: {} });
  assert.equal(report.readiness.ready, true);
  assert.equal(report.readiness.supabase.configured, false);
  assert.equal(report.readiness.supabase.mode, 'in-memory');
  assert.equal(report.readiness.supabase.reachable, undefined, 'no reachability probe should run when unconfigured');
  assert.equal(report.status, 'healthy');
});

test('Supabase configured and reachable reports persistent mode and healthy status', async () => {
  const supabase = makeFakeSupabase();
  const { SupabaseWorkflowStore } = require('../ceo-core/persistence/SupabaseWorkflowStore');
  const store = new SupabaseWorkflowStore({ supabase });
  const runtime = makeRuntime({ store, models: UNRESOLVED_MODELS });
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' };

  const report = await getHealthReport({ runtime, env });
  assert.equal(report.readiness.supabase.configured, true);
  assert.equal(report.readiness.supabase.mode, 'persistent');
  assert.equal(report.readiness.supabase.reachable, true);
  assert.equal(report.status, 'healthy');
});

test('Supabase configured but unreachable degrades status without failing readiness', async () => {
  const brokenStore = { listWaiting: async () => { throw new Error('connection refused'); } };
  const runtime = makeRuntime({ store: brokenStore, models: UNRESOLVED_MODELS });
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' };

  const report = await getHealthReport({ runtime, env });
  assert.equal(report.readiness.ready, true, 'the process itself is still ready to serve requests');
  assert.equal(report.readiness.supabase.reachable, false);
  assert.match(report.readiness.supabase.error, /connection refused/);
  assert.equal(report.status, 'degraded');
});

test('OpenRouter key not configured skips the reachability probe without failing', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  const report = await getHealthReport({ runtime, env: {}, openRouterClient: { listModels: async () => { throw new Error('should not be called'); } } });
  assert.equal(report.readiness.modelResolution.configured, false);
  assert.equal(report.readiness.modelResolution.reachable, undefined);
  assert.equal(report.status, 'healthy');
});

test('OpenRouter reachable with a configured key reports healthy', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  const openRouterClient = { listModels: async () => [{ id: 'anthropic/claude-opus-5' }] };
  const report = await getHealthReport({ runtime, env: { OPENROUTER_API_KEY: 'sk-test' }, openRouterClient });
  assert.equal(report.readiness.modelResolution.configured, true);
  assert.equal(report.readiness.modelResolution.reachable, true);
  assert.equal(report.status, 'healthy');
});

test('OpenRouter unreachable with a configured key degrades status', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  const openRouterClient = { listModels: async () => { throw new Error('fetch failed'); } };
  const report = await getHealthReport({ runtime, env: { OPENROUTER_API_KEY: 'sk-test' }, openRouterClient });
  assert.equal(report.readiness.modelResolution.reachable, false);
  assert.match(report.readiness.modelResolution.error, /fetch failed/);
  assert.equal(report.status, 'degraded');
});

test('routing reflects unresolved model broker state honestly', () => {
  const modelBroker = new ModelBroker(UNRESOLVED_MODELS);
  const routing = buildRouting(modelBroker);
  assert.equal(routing.resolved, false);
  const claude = routing.roles.find(role => role.id === 'claude');
  assert.equal(claude.resolvedAt, null);
  assert.equal(claude.flagshipModelId, null);
});

test('routing reflects a resolved model broker state', () => {
  const modelBroker = new ModelBroker(RESOLVED_MODELS);
  const routing = buildRouting(modelBroker);
  assert.equal(routing.resolved, true);
  const claude = routing.roles.find(role => role.id === 'claude');
  assert.equal(claude.resolvedAt, '2026-07-26T00:00:00.000Z');
  assert.equal(claude.flagshipModelId, 'anthropic/claude-opus-5');
  assert.equal(claude.efficientModelId, 'anthropic/claude-haiku-4.5');
});

test('summarizeAudit tallies real in-memory workflow audit entries by event, and counts failures', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  runtime.workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  runtime.workflowRuntime.registerExecutor('bad', async () => ({ status: 'failed', error: 'boom' }));
  await runtime.workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] } });
  await runtime.workflowRuntime.execute({ workflow: { id: 'wf-b', steps: [{ id: 's1', type: 'bad' }] } });

  const summary = await summarizeAudit(runtime.workflowRuntime.audit, 200);
  assert.equal(summary.source, 'in-memory');
  assert.ok(summary.byEvent['workflow.step.completed'] >= 1);
  assert.ok(summary.byEvent['workflow.step.failed'] >= 1);
  assert.ok(summary.failures >= 1);
});

test('summarizeAudit tallies real in-memory skill audit entries and counts failures', async () => {
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  const executor = new SkillExecutor(registry);
  await executor.run('format_currency', { amount: 5 });
  await executor.run('summarize_text', {}); // input validation failure

  const summary = await summarizeAudit(executor.audit, 200);
  assert.equal(summary.source, 'in-memory');
  assert.equal(summary.byEvent['skill.execution.succeeded'], 1);
  assert.equal(summary.byEvent['skill.execution.failed'], 1);
  assert.equal(summary.failures, 1);
});

test('summarizeAudit bounds in-memory results to the most recent auditLimit entries', async () => {
  const audit = new InMemoryAuditLog();
  for (let i = 0; i < 10; i += 1) await audit.append({ event: `event-${i}` });

  const summary = await summarizeAudit(audit, 3);
  assert.equal(summary.sampleSize, 3);
  assert.deepEqual(Object.keys(summary.byEvent).sort(), ['event-7', 'event-8', 'event-9']);
});

test('summarizeAudit reads from a Supabase-backed audit log and reports its source', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase });
  await audit.append({ event: 'workflow.step.completed', workflowId: 'wf', runId: 'wf:1' });
  await audit.append({ event: 'workflow.step.failed', workflowId: 'wf', runId: 'wf:1' });

  const summary = await summarizeAudit(audit, 200);
  assert.equal(summary.source, 'supabase');
  assert.equal(summary.byEvent['workflow.step.completed'], 1);
  assert.equal(summary.byEvent['workflow.step.failed'], 1);
  assert.equal(summary.failures, 1);
});

test('summarizeAudit handles a missing audit log without crashing', async () => {
  const summary = await summarizeAudit(null, 200);
  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.failures, 0);
});

test('full report is healthy end-to-end with real workflow, skill, and usage activity, all backends in-memory', async () => {
  const runtime = makeRuntime({ models: RESOLVED_MODELS });
  runtime.workflowRuntime.registerExecutor('ok', async () => ({ status: 'ok' }));
  await runtime.workflowRuntime.execute({ workflow: { id: 'wf-a', steps: [{ id: 's1', type: 'ok' }] } });
  const registry = runtime.skillExecutor.registry;
  await runtime.skillExecutor.run('summarize_text', { text: 'hello world, this is fine.' });
  await recordUsage(runtime.usageAudit, {
    model: 'anthropic/claude-opus-5', role: 'claude', costTier: 'flagship', agentId: 'ceo_agent',
    usage: { promptTokens: 1000, completionTokens: 500 }, pricing: { prompt: 0.000003, completion: 0.000015 },
  });

  const report = await getHealthReport({ runtime, env: {} });
  assert.equal(report.status, 'healthy');
  assert.equal(report.routing.resolved, true);
  assert.equal(report.counters.workflow.byEvent['workflow.completed'], 1);
  assert.equal(report.counters.skill.byEvent['skill.execution.succeeded'], 1);
  assert.equal(report.counters.usage.sampleSize, 1);
  assert.equal(report.counters.usage.totalPromptTokens, 1000);
  assert.equal(report.counters.usage.totalCostUsd, 0.0105);
  assert.ok(registry.get('summarize_text'), 'sanity check the real registry backs this executor');
});

test('counters.usage reports unavailable when the runtime has no usageAudit (older/injected runtime shape)', async () => {
  const runtime = makeRuntime({ models: UNRESOLVED_MODELS });
  delete runtime.usageAudit;
  const report = await getHealthReport({ runtime, env: {} });
  assert.equal(report.counters.usage.source, 'unavailable');
  assert.equal(report.status, 'healthy', 'a missing usage log degrades the counter, not overall health');
});

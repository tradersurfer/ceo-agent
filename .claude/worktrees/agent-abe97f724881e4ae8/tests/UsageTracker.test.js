const test = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryAuditLog } = require('../core/WorkflowRuntime');
const { SupabaseAuditLog } = require('../core/persistence/SupabaseAuditLog');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');
const { estimateCostUsd, recordUsage, summarizeUsage, USAGE_AUDIT_TABLE, USAGE_ENTRY_COLUMNS } = require('../core/UsageTracker');

test('estimateCostUsd multiplies tokens by per-token pricing', () => {
  const usage = { promptTokens: 1000, completionTokens: 500 };
  const pricing = { prompt: 0.000003, completion: 0.000015 };
  // 1000 * 0.000003 + 500 * 0.000015 = 0.003 + 0.0075 = 0.0105
  assert.equal(estimateCostUsd(usage, pricing), 0.0105);
});

test('estimateCostUsd returns null (not 0) when pricing is unavailable', () => {
  assert.equal(estimateCostUsd({ promptTokens: 100, completionTokens: 50 }, null), null);
  assert.equal(estimateCostUsd({ promptTokens: 100, completionTokens: 50 }, { prompt: null, completion: null }), null);
});

test('estimateCostUsd tolerates a partial pricing record (one side known)', () => {
  const cost = estimateCostUsd({ promptTokens: 1000, completionTokens: 500 }, { prompt: 0.000003, completion: null });
  assert.equal(cost, 0.003);
});

test('recordUsage appends a full entry to an in-memory audit log', async () => {
  const audit = new InMemoryAuditLog();
  await recordUsage(audit, {
    model: 'anthropic/claude-opus-5',
    role: 'claude',
    costTier: 'flagship',
    agentId: 'ceo_agent',
    tenantId: 'tenant-a',
    usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500, cachedTokens: null, cacheCreationTokens: null, cacheReadTokens: null },
    pricing: { prompt: 0.000003, completion: 0.000015 },
  });

  const [entry] = audit.list();
  assert.equal(entry.event, 'model.usage.recorded');
  assert.equal(entry.model, 'anthropic/claude-opus-5');
  assert.equal(entry.role, 'claude');
  assert.equal(entry.costTier, 'flagship');
  assert.equal(entry.agentId, 'ceo_agent');
  assert.equal(entry.tenantId, 'tenant-a');
  assert.equal(entry.promptTokens, 1000);
  assert.equal(entry.completionTokens, 500);
  assert.equal(entry.estimatedCostUsd, 0.0105);
  assert.deepEqual(entry.pricingSnapshot, { prompt: 0.000003, completion: 0.000015 });
});

test('recordUsage omits tenantId when the caller does not supply one', async () => {
  const audit = new InMemoryAuditLog();
  await recordUsage(audit, { model: 'x', usage: { promptTokens: 1, completionTokens: 1 }, pricing: null });
  assert.equal('tenantId' in audit.list()[0], false);
});

test('summarizeUsage aggregates tokens and cost across in-memory entries, by model', async () => {
  const audit = new InMemoryAuditLog();
  await recordUsage(audit, { model: 'anthropic/claude-opus-5', usage: { promptTokens: 1000, completionTokens: 500 }, pricing: { prompt: 0.000003, completion: 0.000015 } });
  await recordUsage(audit, { model: 'anthropic/claude-opus-5', usage: { promptTokens: 2000, completionTokens: 1000 }, pricing: { prompt: 0.000003, completion: 0.000015 } });
  await recordUsage(audit, { model: 'openai/gpt-6-pro', usage: { promptTokens: 500, completionTokens: 250 }, pricing: null });

  const summary = await summarizeUsage(audit, 200);
  assert.equal(summary.source, 'in-memory');
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.totalPromptTokens, 3500);
  assert.equal(summary.totalCompletionTokens, 1750);
  assert.equal(summary.costUnknownCalls, 1);
  // 0.0105 + 0.021 = 0.0315 (opus calls only — gpt call has no pricing)
  assert.equal(summary.totalCostUsd, 0.0315);
  assert.equal(summary.byModel['anthropic/claude-opus-5'].calls, 2);
  assert.equal(summary.byModel['anthropic/claude-opus-5'].promptTokens, 3000);
  assert.equal(summary.byModel['openai/gpt-6-pro'].calls, 1);
  assert.equal(summary.byModel['openai/gpt-6-pro'].costUsd, 0);
});

test('summarizeUsage handles a missing audit log without crashing', async () => {
  const summary = await summarizeUsage(null, 200);
  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.totalCostUsd, 0);
});

test('recordUsage and summarizeUsage round-trip through a Supabase-backed model_usage table', async () => {
  const supabase = makeFakeSupabase();
  const audit = new SupabaseAuditLog({ supabase, table: USAGE_AUDIT_TABLE, entryColumns: USAGE_ENTRY_COLUMNS });

  await recordUsage(audit, {
    model: 'anthropic/claude-opus-5', role: 'claude', costTier: 'flagship', agentId: 'ceo_agent', tenantId: 'tenant-a',
    usage: { promptTokens: 1000, completionTokens: 500 }, pricing: { prompt: 0.000003, completion: 0.000015 },
  });

  const rows = supabase._rows('model_usage');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, 'anthropic/claude-opus-5');
  assert.equal(rows[0].role, 'claude');
  assert.equal(rows[0].cost_tier, 'flagship');
  assert.equal(rows[0].tenant_id, 'tenant-a');
  assert.equal(rows[0].data.promptTokens, 1000);
  assert.equal(rows[0].data.estimatedCostUsd, 0.0105);

  const summary = await summarizeUsage(audit, 200);
  assert.equal(summary.source, 'supabase');
  assert.equal(summary.totalPromptTokens, 1000);
  assert.equal(summary.totalCostUsd, 0.0105);
  assert.equal(summary.byModel['anthropic/claude-opus-5'].calls, 1);
});

/**
 * Persists and aggregates OpenRouter usage data against the audit-log path
 * (issue #51, built on #52's generalized SupabaseAuditLog). Chat completions
 * don't go through WorkflowRuntime or SkillExecutor — bin/chat.js and
 * app/api/chat/route.ts call OpenRouterClient#chatCompletion directly — so
 * usage gets its own audit table (`model_usage`) rather than being forced
 * into workflow_audit's or skill_audit's column shape, same reasoning #52
 * used to keep those two separate.
 *
 * The aggregation unit is a per-call entry, same as workflow_audit/
 * skill_audit — there's no separate running-counter table to keep
 * consistent. summarizeUsage() sums over fetched entries on read, mirroring
 * how HealthReporter#summarizeAudit already tallies by event on read rather
 * than maintaining a live counter.
 */

const USAGE_AUDIT_TABLE = 'model_usage';
const USAGE_ENTRY_COLUMNS = ['model', 'role', 'costTier'];

/**
 * Estimates USD cost from token usage and per-token pricing. Returns null
 * when pricing is unavailable (unresolved model, local/non-API role) rather
 * than a misleading 0 — "no price data" and "free" are different facts.
 * @param {object} usage OpenRouterClient#chatCompletion's usage shape.
 * @param {{prompt: number|null, completion: number|null}|null} pricing
 * @returns {number|null} Estimated cost in USD, or null if not computable.
 */
function estimateCostUsd(usage, pricing) {
  if (!pricing || (pricing.prompt == null && pricing.completion == null)) return null;
  const promptCost = pricing.prompt != null && usage.promptTokens != null ? pricing.prompt * usage.promptTokens : 0;
  const completionCost = pricing.completion != null && usage.completionTokens != null
    ? pricing.completion * usage.completionTokens
    : 0;
  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Records one chat-completion's usage as an audit entry.
 * @param {object} audit An audit log instance (InMemoryAuditLog or a SupabaseAuditLog configured for model_usage).
 * @param {object} input
 * @param {string} input.model OpenRouter API model id actually called.
 * @param {string} [input.role] Internal role label (e.g. "claude").
 * @param {string} [input.costTier] "flagship" | "efficient".
 * @param {string} [input.agentId] Agent the completion was made on behalf of.
 * @param {string} [input.tenantId] Tenant, when known.
 * @param {object} input.usage OpenRouterClient#chatCompletion's usage shape.
 * @param {{prompt: number|null, completion: number|null}|null} [input.pricing] Per-token USD pricing, from ModelBroker#getPricing.
 * @returns {Promise<object>} The stored entry.
 */
async function recordUsage(audit, { model, role, costTier, agentId, tenantId, usage, pricing }) {
  return audit.append({
    event: 'model.usage.recorded',
    model,
    role: role || null,
    costTier: costTier || null,
    agentId: agentId || null,
    ...(tenantId != null ? { tenantId } : {}),
    promptTokens: usage.promptTokens ?? null,
    completionTokens: usage.completionTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    cachedTokens: usage.cachedTokens ?? null,
    cacheCreationTokens: usage.cacheCreationTokens ?? null,
    cacheReadTokens: usage.cacheReadTokens ?? null,
    pricingSnapshot: pricing || null,
    estimatedCostUsd: estimateCostUsd(usage, pricing),
  });
}

/**
 * Reads up to `limit` recent usage entries and aggregates tokens/cost,
 * overall and broken down by model — same "tally on read" pattern as
 * HealthReporter#summarizeAudit, and works against both InMemoryAuditLog
 * (`.list()`) and the Supabase conformer (`.query()`).
 * @param {object} audit An audit log instance.
 * @param {number} limit Max recent entries to read and aggregate.
 * @returns {Promise<{source: string, sampleSize: number, totalPromptTokens: number, totalCompletionTokens: number, totalCostUsd: number, costUnknownCalls: number, byModel: object}>}
 */
async function summarizeUsage(audit, limit) {
  if (!audit) {
    return {
      source: 'unavailable', sampleSize: 0,
      totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, costUnknownCalls: 0,
      byModel: {},
    };
  }

  const source = typeof audit.query === 'function' ? 'supabase' : 'in-memory';
  const entries = typeof audit.query === 'function'
    ? await audit.query({ limit })
    : audit.list().slice(-limit);

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  let costUnknownCalls = 0;
  const byModel = {};

  for (const entry of entries) {
    const data = entry.data || entry; // Supabase rows nest non-column fields in `data`; in-memory entries are flat.
    const model = entry.model || data.model || 'unknown';
    const promptTokens = data.promptTokens || 0;
    const completionTokens = data.completionTokens || 0;
    const costUsd = data.estimatedCostUsd;

    totalPromptTokens += promptTokens;
    totalCompletionTokens += completionTokens;
    if (costUsd == null) costUnknownCalls += 1;
    else totalCostUsd += costUsd;

    if (!byModel[model]) byModel[model] = { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
    byModel[model].calls += 1;
    byModel[model].promptTokens += promptTokens;
    byModel[model].completionTokens += completionTokens;
    if (costUsd != null) byModel[model].costUsd += costUsd;
  }

  return {
    source,
    sampleSize: entries.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    costUnknownCalls,
    byModel,
  };
}

module.exports = { estimateCostUsd, recordUsage, summarizeUsage, USAGE_AUDIT_TABLE, USAGE_ENTRY_COLUMNS };

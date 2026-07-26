/**
 * Builds a health/observability report from real runtime state — no
 * parallel counters or separate tracking mechanism. Liveness is the
 * process itself; readiness checks Supabase reachability (only when
 * configured — its absence is a supported first-class mode, not a
 * failure) and OpenRouter reachability for model resolution; routing
 * reads the model broker's already-resolved role→model table; counters
 * tally the real workflow and skill audit logs (`core/WorkflowRuntime.js`,
 * `core/SkillExecutor.js`) — whichever backend (in-memory or Supabase,
 * per Priority 5a) each is actually configured with.
 *
 * Cost counters are intentionally not included: nothing in this codebase
 * persists or aggregates the per-call `usage` OpenRouter returns
 * (`sdk/OpenRouterClient.js#chatCompletion`) anywhere today, so there is
 * no real cost data to read. Adding one here would be exactly the
 * invented-parallel-mechanism this design explicitly avoids.
 */

const FAILURE_EVENT_PATTERN = /fail/i;

/**
 * Reads up to `limit` recent entries from an audit log and tallies them
 * by event type. Works against both `InMemoryAuditLog` (sync `list()`)
 * and the Supabase conformers (async `query()`), reporting which backend
 * actually served the data rather than assuming one.
 * @param {object} audit An audit log instance (`.list()` or `.query()`).
 * @param {number} limit Max recent entries to read and tally.
 * @returns {Promise<{source: string, sampleSize: number, byEvent: object, failures: number}>}
 */
async function summarizeAudit(audit, limit) {
  if (!audit) return { source: 'unavailable', sampleSize: 0, byEvent: {}, failures: 0 };

  const source = typeof audit.query === 'function' ? 'supabase' : 'in-memory';
  const entries = typeof audit.query === 'function'
    ? await audit.query({ limit })
    : audit.list().slice(-limit);

  const byEvent = {};
  let failures = 0;
  for (const entry of entries) {
    const event = entry.event || 'unknown';
    byEvent[event] = (byEvent[event] || 0) + 1;
    if (FAILURE_EVENT_PATTERN.test(event)) failures += 1;
  }

  return { source, sampleSize: entries.length, byEvent, failures };
}

/**
 * Checks Supabase reachability by calling the real `listWaiting()` method
 * every workflow store conformer implements (Priority 5b) — a genuine,
 * already-existing lightweight query, not a purpose-built ping.
 * @param {object} store A workflow store instance.
 * @returns {Promise<{reachable: boolean, error?: string}>}
 */
async function checkStoreReachable(store) {
  try {
    await store.listWaiting();
    return { reachable: true };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Checks OpenRouter reachability with a real, read-only, no-key-required
 * catalog fetch (`OpenRouterClient#listModels`).
 * @param {object} openRouterClient An OpenRouterClient instance.
 * @returns {Promise<{reachable: boolean, error?: string}>}
 */
async function checkOpenRouterReachable(openRouterClient) {
  try {
    await openRouterClient.listModels();
    return { reachable: true };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Builds the routing snapshot from the model broker's real, already-
 * computed state (`ModelBroker#listModels`) — which roles have been
 * resolved to which OpenRouter model ids, at which tier.
 * @param {object} modelBroker A ModelBroker instance.
 * @returns {{resolved: boolean, roles: object[]}}
 */
function buildRouting(modelBroker) {
  const models = modelBroker.listModels();
  const roles = models.map(model => ({
    id: model.id,
    role: model.role || null,
    enabled: model.enabled,
    resolvedAt: model.resolvedAt || null,
    flagshipModelId: (model.tiers && model.tiers.flagship && model.tiers.flagship.apiModelId) || model.apiModelId || null,
    efficientModelId: (model.tiers && model.tiers.efficient && model.tiers.efficient.apiModelId) || null,
  }));
  return { resolved: roles.some(role => role.resolvedAt), roles };
}

/**
 * Builds the full health/observability report.
 * @param {object} options
 * @param {object|null} options.runtime A JECIRuntime instance from createRuntime(), or null if setup hasn't run.
 * @param {object} [options.openRouterClient] An OpenRouterClient instance for the reachability probe.
 * @param {object} [options.env] Environment source (defaults to process.env).
 * @param {number} [options.auditLimit] Max recent audit entries to tally per log (default 200).
 * @returns {Promise<object>} The health report.
 */
async function getHealthReport({ runtime, openRouterClient = null, env = process.env, auditLimit = 200 } = {}) {
  const now = new Date();
  const liveness = { up: true, uptimeSeconds: Math.floor(process.uptime()) };

  if (!runtime) {
    return {
      status: 'unhealthy',
      timestamp: now.toISOString(),
      liveness,
      readiness: { ready: false, reason: 'Runtime not configured. Run setup first (npm run setup).' },
    };
  }

  const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = { configured: supabaseConfigured, mode: supabaseConfigured ? 'persistent' : 'in-memory' };
  if (supabaseConfigured) {
    Object.assign(supabase, await checkStoreReachable(runtime.workflowRuntime.store));
  }

  const openRouterKeyConfigured = Boolean(env.OPENROUTER_API_KEY);
  const modelResolution = { configured: openRouterKeyConfigured };
  if (openRouterKeyConfigured && openRouterClient) {
    Object.assign(modelResolution, await checkOpenRouterReachable(openRouterClient));
  }

  const routing = buildRouting(runtime.modelBroker);
  modelResolution.resolved = routing.resolved;

  const [workflow, skill] = await Promise.all([
    summarizeAudit(runtime.workflowRuntime.audit, auditLimit),
    summarizeAudit(runtime.skillExecutor.audit, auditLimit),
  ]);

  // Absence of an optional backend is a supported mode, not a failure — the
  // process is ready to serve requests either way. A configured-but-
  // unreachable dependency degrades the report without failing readiness,
  // since the app itself still functions (in-memory fallback / no live
  // routing), it just isn't running at full capability.
  const supabaseUnreachable = supabaseConfigured && supabase.reachable === false;
  const openRouterUnreachable = openRouterKeyConfigured && modelResolution.reachable === false;
  const status = (supabaseUnreachable || openRouterUnreachable) ? 'degraded' : 'healthy';

  return {
    status,
    timestamp: now.toISOString(),
    liveness,
    readiness: {
      ready: true,
      supabase,
      modelResolution,
    },
    routing,
    counters: { workflow, skill },
  };
}

module.exports = { getHealthReport, summarizeAudit, checkStoreReachable, checkOpenRouterReachable, buildRouting };

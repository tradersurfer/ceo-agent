const crypto = require('crypto');
const MemoryClient = require('../../../sdk/MemoryClient');
const SalesIntakeBridge = require('../../../departments/marketing/sales-intake/src/SalesIntakeBridge');
const OnboardingCommsBridge = require('../../../departments/marketing/onboarding-comms/src/OnboardingCommsBridge');
const DisputeAgentBridge = require('../../../examples/dispute-agent/src/DisputeAgentBridge');
const HermesBridge = require('../../../departments/operations/hermes/src/HermesBridge');

/**
 * Supervisor dispatch handler — pure Node.js, no Next.js dependency.
 * Testable standalone; route.ts wraps this for Next.js deployment.
 */

const CONVERSATIONAL_AGENTS = new Set([
  'ceo_agent', 'cfo_agent', 'cto_agent', 'cmo_agent', 'chro_agent', 'clo_agent',
]);

const BRIDGE_FACTORIES = {
  sales_intake_agent: () => new SalesIntakeBridge(),
  onboarding_comms_agent: () => new OnboardingCommsBridge(),
  dispute_agent: () => new DisputeAgentBridge(),
  hermes: () => new HermesBridge(),
};

// In-memory sliding-window rate limiter. Suitable for a single-instance
// deployment (the default for this scaffold). Multi-instance/production
// deployments should replace this with a shared store (Redis, etc.) —
// noted in SECURITY.md.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map(); // key -> array of timestamps

/**
 * Checks and records a rate-limit hit for a given key (e.g. caller IP).
 * @param {string} key Identifying key for the caller.
 * @returns {{allowed: boolean, remaining: number}}
 */
function checkRateLimit(key) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (requestLog.get(key) || []).filter(t => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(key, timestamps);
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - timestamps.length };
}

/**
 * Validates the dispatch secret from request headers using a timing-safe
 * comparison, so response time doesn't leak how many leading characters
 * of a guessed secret were correct.
 * @param {string|null} provided - value of x-dispatch-secret header
 * @param {string|undefined} expected - value of DISPATCH_SECRET env var
 * @returns {boolean}
 */
function isAuthorized(provided, expected) {
  if (!expected || !provided) return false;
  const providedBuf = Buffer.from(String(provided));
  const expectedBuf = Buffer.from(String(expected));
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Validates required fields on the dispatch body.
 * @param {object} body
 * @returns {string|null} error message or null
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  if (!body.agent) return 'agent is required.';
  if (!body.task_type) return 'task_type is required.';
  if (!body.project) return 'project is required.';
  return null;
}

/**
 * Builds a normalized task object for a bridge.
 * @param {object} body
 * @returns {object}
 */
function buildTask(body) {
  const { agent, task_type, project, approved_by = 'ceo_agent', payload = {} } = body;
  return {
    agent,
    type: task_type,
    project,
    goal: `Execute ${task_type} for project ${project}`,
    task: `${task_type} dispatched by CEO Agent`,
    approved_by,
    metadata: { taskType: task_type, ...payload },
  };
}

/**
 * Dispatches a validated task to the correct agent runtime.
 * @param {string} agentId
 * @param {object} task
 * @returns {Promise<object>}
 */
async function routeToAgent(agentId, task, runtime = null) {
  await recordDispatchMemory(agentId, task);

  if (CONVERSATIONAL_AGENTS.has(agentId)) {
    const routing = runtime
      ? runtime.routeTask({ ...task, assignedAgent: agentId })
      : null;
    if (routing && routing.status !== 'routed') return routing;
    return {
      agent: agentId,
      routedAgent: routing ? routing.agent : null,
      status: 'conversational_only',
      summary: `${agentId} is a conversational C-suite agent, not a dispatchable automation target. Use the chat interface (node bin/chat.js) to talk to this agent directly.`,
      task,
      timestamp: new Date().toISOString(),
    };
  }

  const bridgeFactory = BRIDGE_FACTORIES[agentId];
  if (bridgeFactory) {
    const bridge = bridgeFactory();
    // Most bridges expose trigger(); Hermes exposes runTask(). Call whichever
    // the bridge implements so dispatch runs its real validation instead of a
    // hardcoded placeholder. Hermes still validates-and-queues (it does not
    // execute an external runtime), but that result now comes from the bridge.
    const invoke = typeof bridge.trigger === 'function'
      ? bridge.trigger.bind(bridge)
      : bridge.runTask.bind(bridge);
    return invoke(task);
  }

  return {
    status: 'blocked',
    reason: `No dispatch handler registered for agent: ${agentId}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Records dispatch activity in shared memory when Supabase is configured.
 * Memory write failures should not block dispatch execution.
 * @param {string} agentId Target agent id.
 * @param {object} task Normalized task object.
 * @returns {Promise<object|null>} Created row, skipped record, or null.
 */
async function recordDispatchMemory(agentId, task) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const memory = new MemoryClient();
  return memory.writeEntry({
    tenantId: task.tenantId || task.tenant_id || (task.metadata && (task.metadata.tenantId || task.metadata.tenant_id)) || null,
    sessionId: task.sessionId || task.session_id || (task.metadata && (task.metadata.sessionId || task.metadata.session_id)) || null,
    agentSource: task.approved_by || 'ceo_agent',
    entryType: 'task_status',
    title: `Dispatch queued for ${agentId}`,
    content: task.task || task.goal || `CEO Agent dispatched ${task.type || 'task'} to ${agentId}.`,
    metadata: {
      event: 'dispatch',
      targetAgent: agentId,
      taskType: task.type || (task.metadata && task.metadata.taskType) || null,
      project: task.project || null,
    },
  }).catch(error => ({
    skipped: true,
    reason: error.message,
  }));
}

module.exports = { isAuthorized, validateBody, buildTask, routeToAgent, recordDispatchMemory, checkRateLimit };

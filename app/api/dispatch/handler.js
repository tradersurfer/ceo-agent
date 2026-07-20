const MemoryClient = require('../../../sdk/MemoryClient');

/**
 * Supervisor dispatch handler — pure Node.js, no Next.js dependency.
 * Testable standalone; route.ts wraps this for Next.js deployment.
 */

/**
 * Validates the dispatch secret from request headers.
 * @param {string|null} provided - value of x-dispatch-secret header
 * @param {string|undefined} expected - value of DISPATCH_SECRET env var
 * @returns {boolean}
 */
function isAuthorized(provided, expected) {
  return !!expected && provided === expected;
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
async function routeToAgent(agentId, task) {
  await recordDispatchMemory(agentId, task);

  switch (agentId) {
    case 'dispute_agent':
      return dispatchToDisputeAgent(task);
    case 'hermes':
      return {
        agent: 'hermes',
        status: 'queued',
        summary: 'Hermes runtime HTTP dispatch not yet connected.',
        task,
        timestamp: new Date().toISOString(),
      };
    default:
      return {
        status: 'blocked',
        reason: `No dispatch handler registered for agent: ${agentId}`,
        timestamp: new Date().toISOString(),
      };
  }
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

/**
 * Triggers the dispute agent's action loop via HTTP.
 * Requires DISPUTE_AGENT_URL and DISPUTE_AGENT_WEBHOOK_SECRET env vars.
 * @param {object} task
 * @returns {Promise<object>}
 */
async function dispatchToDisputeAgent(task) {
  const base = process.env.DISPUTE_AGENT_URL;
  const secret = process.env.DISPUTE_AGENT_WEBHOOK_SECRET;

  if (!base || !secret) {
    return {
      agent: 'dispute_agent',
      status: 'queued',
      summary: 'Set DISPUTE_AGENT_URL and DISPUTE_AGENT_WEBHOOK_SECRET to enable runtime dispatch.',
      task,
      timestamp: new Date().toISOString(),
    };
  }

  const endpoint = `${base.replace(/\/$/, '')}/api/agent/run?secret=${secret}`;
  const response = await fetch(endpoint, { method: 'POST' });
  const data = await response.json().catch(() => ({}));

  return {
    agent: 'dispute_agent',
    status: response.ok ? 'triggered' : 'failed',
    httpStatus: response.status,
    result: data,
    task,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { isAuthorized, validateBody, buildTask, routeToAgent, recordDispatchMemory };
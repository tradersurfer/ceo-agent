const SalesIntakeBridge = require('../departments/marketing/sales-intake/src/SalesIntakeBridge');
const OnboardingCommsBridge = require('../departments/marketing/onboarding-comms/src/OnboardingCommsBridge');
const DisputeAgentBridge = require('../examples/dispute-agent/src/DisputeAgentBridge');
const HermesBridge = require('../departments/operations/hermes/src/HermesBridge');

/**
 * Registers workflow-step executors backed by the default Sales Intake and
 * Onboarding Comms bridges, Hermes (COO), and the optional Dispute Agent
 * example onto a WorkflowRuntime instance. One executor is registered per
 * allowed task type on each bridge, so a workflow step with type: 'create_lead'
 * will actually call SalesIntakeBridge.trigger() when the workflow runs.
 *
 * Hermes exposes runTask() rather than trigger(); the executor calls whichever
 * the bridge implements. Hermes validates and queues but does not execute an
 * external runtime, so a Hermes workflow step honestly resolves to failure
 * (validated-but-not-executed) rather than a false success — actual Hermes
 * runtime execution is tracked as a separate follow-up.
 *
 * Bridge trigger() results are translated into WorkflowRuntime's pass/fail
 * contract. Only a bridge status of 'triggered' counts as workflow success.
 * 'blocked' (validation failed), 'failed' (runtime error), and 'queued'
 * (validated but this install hasn't configured the bridge's runtime URL)
 * all count as WORKFLOW FAILURE — a step that only got queued did not
 * actually do anything, and marking it "completed" would be dishonest
 * bookkeeping. An unconfigured runtime surfaces as a clear, retryable
 * failure instead of a fake success.
 *
 * NOTE: bridges read their allowlists (CEO_AGENT_PROJECTS, CEO_AGENT_APPROVERS)
 * from environment variables at module-load time. By default these are
 * empty/locked-down — see sdk/Permissions.js — so a workflow step will be
 * blocked at validation until the install explicitly sets CEO_AGENT_PROJECTS
 * to include whatever project id the workflow uses.
 *
 * @param {import('./WorkflowRuntime').WorkflowRuntime} workflowRuntime Runtime to register onto.
 * @param {object} [options] Registration options.
 * @param {string} [options.project] Default project id used when a workflow
 *   step doesn't specify one on its own input/context.
 * @param {string} [options.approvedBy] Default approver id. Defaults to 'ceo_agent'.
 * @returns {{sales_intake_agent: object, onboarding_comms_agent: object, dispute_agent: object, hermes: object}} The instantiated bridges.
 */
function registerBridgeExecutors(workflowRuntime, options = {}) {
  const defaultProject = options.project || process.env.CEO_AGENT_DEFAULT_PROJECT || null;
  const defaultApprovedBy = options.approvedBy || 'ceo_agent';

  const bridges = {
    sales_intake_agent: new SalesIntakeBridge(),
    onboarding_comms_agent: new OnboardingCommsBridge(),
    dispute_agent: new DisputeAgentBridge(),
    hermes: new HermesBridge(),
  };

  for (const bridge of Object.values(bridges)) {
    for (const taskType of bridge.allowedTaskTypes) {
      workflowRuntime.registerExecutor(taskType, buildExecutor(bridge, taskType, defaultProject, defaultApprovedBy));
    }
  }

  return bridges;
}

/**
 * Builds one WorkflowRuntime executor function for a given bridge + task type.
 * @param {import('../sdk/BaseBridge')} bridge Bridge instance.
 * @param {string} taskType Task type this executor handles.
 * @param {string|null} defaultProject Default project id.
 * @param {string} defaultApprovedBy Default approver id.
 * @returns {Function} Executor compatible with WorkflowRuntime.registerExecutor().
 */
function buildExecutor(bridge, taskType, defaultProject, defaultApprovedBy) {
  return async ({ step, input, context }) => {
    const merged = { ...input, ...context, ...(step.params || {}) };
    const project = merged.project || defaultProject;

    const task = {
      agent: bridge.agentId,
      type: taskType,
      project,
      goal: merged.goal || `Execute ${taskType} for project ${project}`,
      task: merged.task || `${taskType} triggered by workflow step ${step.id}`,
      approved_by: merged.approved_by || defaultApprovedBy,
      payload: merged.payload || merged,
    };

    // Most bridges expose trigger(); Hermes exposes runTask(). Call whichever
    // the bridge actually implements so a single executor path covers all four.
    const invoke = typeof bridge.trigger === 'function'
      ? bridge.trigger.bind(bridge)
      : bridge.runTask.bind(bridge);
    const result = await invoke(task);

    if (result.status === 'triggered') {
      return { status: 'ok', bridgeResult: result };
    }

    // Hermes never returns 'triggered' — it validates and queues without
    // executing an external runtime, so its steps honestly resolve to failure
    // (queued did not execute) until real execution wiring exists. blocked
    // uses errors on trigger()-style bridges and blockers on Hermes runTask().
    const reason = result.status === 'blocked'
      ? (result.errors || result.blockers || []).join('; ')
      : result.summary || result.error || `Bridge returned status: ${result.status}`;

    return { status: 'failed', error: reason, bridgeResult: result };
  };
}

module.exports = { registerBridgeExecutors };

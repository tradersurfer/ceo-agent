const BaseBridge = require('../../../../sdk/BaseBridge');

const ALLOWED_APPROVERS = (process.env.CEO_AGENT_APPROVERS || 'ceo_agent')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_PROJECTS = (process.env.CEO_AGENT_PROJECTS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_TASK_TYPES = [
  'cron_create',
  'webhook_subscribe',
  'api_trigger',
  'workflow_execution',
  'skill_chain',
  'sandbox_execution',
  'system_monitoring',
  'alert_dispatch',
  'intake_parsing',
  'crm_action',
  'scheduled_job',
  'file_processing',
  'memory_lookup',
  'automation_run',
];

class HermesBridge extends BaseBridge {
  /** Creates the Hermes SDK bridge with fixed identity and allowlists. */
  constructor() {
    super({
      id: 'hermes',
      name: 'Hermes',
      title: 'Chief Operating Officer',
      reportsTo: 'ceo_agent',
      runtimePath: process.env.HERMES_RUNTIME_PATH || null,
      applicationPath: process.env.HERMES_APPLICATION_PATH || null,
      allowedApprovers: ALLOWED_APPROVERS,
      allowedProjects: ALLOWED_PROJECTS,
      allowedTaskTypes: ALLOWED_TASK_TYPES,
    });
  }

  /**
   * Validates a Hermes task and preserves the legacy blockers field.
   * @param {object} task Hermes task input.
   * @returns {object} Validation result.
   */
  validateTask(task) {
    const validation = super.validateTask(task);
    return { ...validation, blockers: [...validation.errors] };
  }

  /**
   * Validates and queues a Hermes task without invoking its runtime.
   * @param {object} task Hermes task input.
   * @returns {Promise<object>} Legacy-compatible Hermes result.
   */
  async runTask(task) {
    const result = await super.execute(task);
    const queued = result.status === 'queued';

    return {
      agent: 'hermes',
      status: result.status,
      summary: queued
        ? 'Task validated and queued. Hermes runtime execution is not connected yet.'
        : 'HermesBridge rejected the task before execution.',
      blockers: [...result.errors],
      actions_taken: queued
        ? [
            'Validated assigned agent.',
            'Validated approver.',
            'Validated authorized project.',
            'Validated authorized task type.',
          ]
        : [],
      ...(queued ? { task } : {}),
      timestamp: result.timestamp,
    };
  }
}

module.exports = HermesBridge;

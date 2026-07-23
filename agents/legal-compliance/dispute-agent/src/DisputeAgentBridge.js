const BaseBridge = require('../../../../sdk/BaseBridge');

const ALLOWED_APPROVERS = (process.env.CEO_AGENT_APPROVERS || 'ceo_agent')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_PROJECTS = (process.env.CEO_AGENT_PROJECTS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_TASK_TYPES = [
  'intake_parsing',
  'pdf_parse',
  'dispute_generate',
  'dispute_parse_response',
  'dispute_strategy',
  'letter_package',
  'email_sequence',
  'agent_loop_trigger',
  'crm_action',
];

class DisputeAgentBridge extends BaseBridge {
  /**
   * Creates the Dispute Agent SDK bridge with fixed identity and allowlists.
   * Runtime connectivity requires DISPUTE_AGENT_URL and DISPUTE_AGENT_WEBHOOK_SECRET in env.
   */
  constructor() {
    super({
      id: 'dispute_agent',
      name: 'Dispute Agent',
      title: 'Credit Dispute Automation Agent',
      reportsTo: 'clo_agent',
      allowedApprovers: ALLOWED_APPROVERS,
      allowedProjects: ALLOWED_PROJECTS,
      allowedTaskTypes: ALLOWED_TASK_TYPES,
    });
  }

  /**
   * Returns the dispute agent's agent-loop trigger URL, or null if env is not set.
   * The secret is no longer embedded in the URL — see trigger() for the
   * x-dispute-secret header instead.
   * @returns {string|null}
   */
  getRunEndpoint() {
    const base = process.env.DISPUTE_AGENT_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/api/agent/run`;
  }

  /**
   * Returns the analyze endpoint for submitting a PDF credit report.
   * @returns {string|null}
   */
  getAnalyzeEndpoint() {
    const base = process.env.DISPUTE_AGENT_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/api/analyze`;
  }

  /**
   * Validates a task and either triggers the dispute agent's action loop
   * or returns a queued status if the runtime URL is not configured.
   * @param {object} task Task input.
   * @returns {Promise<object>} Trigger result.
   */
  async trigger(task) {
    const validation = this.validateTask(task);
    if (!validation.valid) {
      return {
        agent: this.id,
        status: 'blocked',
        errors: validation.errors,
        timestamp: new Date().toISOString(),
      };
    }

    const endpoint = this.getRunEndpoint();
    const secret = process.env.DISPUTE_AGENT_WEBHOOK_SECRET;
    if (!endpoint || !secret) {
      return {
        agent: this.id,
        status: 'queued',
        summary: 'Task validated. Set DISPUTE_AGENT_URL and DISPUTE_AGENT_WEBHOOK_SECRET to connect runtime.',
        task,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-dispute-secret': secret },
      });
      const data = await response.json().catch(() => ({}));
      return {
        agent: this.id,
        status: response.ok ? 'triggered' : 'failed',
        httpStatus: response.status,
        result: data,
        task,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        agent: this.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        task,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Validates and queues a Dispute Agent task. Alias kept consistent with HermesBridge.
   * Use trigger() to also fire the runtime.
   * @param {object} task Task input.
   * @returns {Promise<object>} Legacy-compatible result.
   */
  async runTask(task) {
    const result = await super.execute(task);
    const queued = result.status === 'queued';

    return {
      agent: this.id,
      status: result.status,
      summary: queued
        ? 'Task validated and queued. Call trigger() to fire the dispute agent runtime.'
        : 'DisputeAgentBridge rejected the task before execution.',
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

module.exports = DisputeAgentBridge;

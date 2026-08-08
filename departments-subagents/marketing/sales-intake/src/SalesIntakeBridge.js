const BaseBridge = require('../../../../sdk/BaseBridge');

const ALLOWED_APPROVERS = (process.env.CEO_AGENT_APPROVERS || 'ceo_agent')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_PROJECTS = (process.env.CEO_AGENT_PROJECTS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_TASK_TYPES = ['create_lead', 'intake_capture'];

// ADR-010: same ids/restricts as registry/agent-registry.json's
// sales_intake_agent.off_limits. modify_client_records_outside_scope and
// override_ceo_agent_routing stay enforceable: false -- see that file's
// comments for why (unverifiable qualifier / relational constraint).
const OFF_LIMITS = [
  { id: 'unauthorized_email', label: 'Sending unauthorized emails', restricts: [] },
  { id: 'modify_client_records_outside_scope', label: 'Modifying client records outside authorized scope', restricts: ['create_lead', 'intake_capture'], enforceable: false },
  { id: 'override_ceo_agent_routing', label: 'Overriding CEO Agent routing decisions', restricts: [], enforceable: false },
];

class SalesIntakeBridge extends BaseBridge {
  constructor() {
    super({
      id: 'sales_intake_agent',
      name: 'Sales Intake Agent',
      title: 'VP of Sales',
      reportsTo: 'cmo_agent',
      allowedApprovers: ALLOWED_APPROVERS,
      allowedProjects: ALLOWED_PROJECTS,
      allowedTaskTypes: ALLOWED_TASK_TYPES,
      offLimits: OFF_LIMITS,
    });
  }

  getIntakeEndpoint() {
    const base = process.env.SALES_INTAKE_AGENT_URL;
    const secret = process.env.SALES_INTAKE_AGENT_SECRET;
    if (!base || !secret) return null;
    return { url: `${base.replace(/\/$/, '')}/api/intake`, secret };
  }

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

    const endpoint = this.getIntakeEndpoint();
    if (!endpoint) {
      return {
        agent: this.id,
        status: 'queued',
        summary: 'Task validated. Set SALES_INTAKE_AGENT_URL and SALES_INTAKE_AGENT_SECRET to connect runtime.',
        task,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-intake-secret': endpoint.secret,
        },
        body: JSON.stringify(task.payload || {}),
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

  async runTask(task) {
    const result = await super.execute(task);
    const queued = result.status === 'queued';

    return {
      agent: this.id,
      status: result.status,
      summary: queued
        ? 'Task validated and queued. Call trigger() to submit lead to intake API.'
        : 'SalesIntakeBridge rejected the task before execution.',
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

module.exports = SalesIntakeBridge;

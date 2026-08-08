const BaseBridge = require('../../../../sdk/BaseBridge');

const ALLOWED_APPROVERS = (process.env.CEO_AGENT_APPROVERS || 'ceo_agent')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_PROJECTS = (process.env.CEO_AGENT_PROJECTS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_TASK_TYPES = [
  'email_welcome',
  'email_score_invite',
  'email_upload_reminder',
  'email_review_call',
  'email_scan_complete',
  'email_mail_reminder',
  'email_bureau_checkin',
  'email_sweep_upgrade',
  'email_testimonial',
  'email_sequence_queue',
];

// ADR-010: same ids/restricts as registry/agent-registry.json's
// onboarding_comms_agent.off_limits. unsolicited_email names every real
// task type here as what it "would" restrict, but stays enforceable: false
// -- sending onboarding email IS this agent's entire job, and nothing here
// can check the "unsolicited" qualifier yet (ADR-010 §1.2, Bucket B); a
// bare category match would hard-block 100% of this agent's legitimate
// work, which is worse than no enforcement, not safer.
const OFF_LIMITS = [
  { id: 'unsolicited_email', label: 'Sending unsolicited emails', restricts: [...ALLOWED_TASK_TYPES], enforceable: false },
  { id: 'modify_client_records_outside_scope', label: 'Modifying client records outside authorized scope', restricts: [] },
  { id: 'override_ceo_agent_routing', label: 'Overriding CEO Agent routing decisions', restricts: [], enforceable: false },
];

class OnboardingCommsBridge extends BaseBridge {
  constructor() {
    super({
      id: 'onboarding_comms_agent',
      name: 'Onboarding Communications Agent',
      title: 'Client Onboarding Email Lifecycle Agent',
      reportsTo: 'cmo_agent',
      allowedApprovers: ALLOWED_APPROVERS,
      allowedProjects: ALLOWED_PROJECTS,
      allowedTaskTypes: ALLOWED_TASK_TYPES,
      offLimits: OFF_LIMITS,
    });
  }

  getSequenceTriggerEndpoint() {
    const base = process.env.ONBOARDING_COMMS_AGENT_URL;
    const secret = process.env.ONBOARDING_COMMS_AGENT_SECRET;
    if (!base || !secret) return null;
    return { url: `${base.replace(/\/$/, '')}/api/webhooks/sequence-trigger`, secret };
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

    const endpoint = this.getSequenceTriggerEndpoint();
    if (!endpoint) {
      return {
        agent: this.id,
        status: 'queued',
        summary: 'Task validated. Set ONBOARDING_COMMS_AGENT_URL and ONBOARDING_COMMS_AGENT_SECRET to connect runtime.',
        task,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-comms-secret': endpoint.secret,
        },
        body: JSON.stringify({
          email_type: task.type,
          ...(task.payload || {}),
        }),
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
        ? 'Task validated and queued. Call trigger() to fire email via comms API.'
        : 'OnboardingCommsBridge rejected the task before execution.',
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

module.exports = OnboardingCommsBridge;

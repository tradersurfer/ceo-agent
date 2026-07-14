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

class OnboardingCommsBridge extends BaseBridge {
  constructor() {
    super({
      id: 'onboarding_comms_agent',
      name: 'Onboarding Communications Agent',
      title: 'Client Onboarding Email Lifecycle Agent',
      reportsTo: 'ceo_agent',
      allowedApprovers: ALLOWED_APPROVERS,
      allowedProjects: ALLOWED_PROJECTS,
      allowedTaskTypes: ALLOWED_TASK_TYPES,
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

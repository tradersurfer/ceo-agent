const BaseBridge = require('../../../../sdk/BaseBridge');
const { HermesGatewayClient, HermesGatewayError } = require('./HermesGatewayClient');

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

// ADR-009 §4's narrow, Hermes-specific off_limits stopgap — checked before
// any network call. Phrases are the canonical text from
// registry/agent-registry.json's `hermes.off_limits`; this is NOT the
// general free-text mechanism ADR-010 designs for all nine agents.
// ADR-010: the general, structured-id off_limits mechanism (SkillExecutor.
// run()'s sibling check, BaseBridge.validatePermissions()'s sibling check
// below). Same ids/restricts as registry/agent-registry.json's
// hermes.off_limits; restricts stays [] on every entry here because none
// of ALLOWED_TASK_TYPES above genuinely performs any of these actions
// today (ADR-010 §1.2, Bucket C) -- ships inert-but-wired, exactly as
// ADR-010 §1.3 describes, ready to start firing the moment a future task
// type that actually does one of these things populates its restricts.
// This is separate from, and does not replace, OFF_LIMITS_PATTERNS below
// (ADR-009 §4's narrow payload-text stopgap, which stays in place
// unchanged per ADR-010's own non-goals).
const OFF_LIMITS = [
  { id: 'change_credentials', label: 'Changing credentials', restricts: [] },
  { id: 'move_money', label: 'Moving money', restricts: [] },
  { id: 'legal_claims', label: 'Making legal claims', restricts: [] },
  { id: 'change_pricing', label: 'Changing pricing', restricts: [] },
  { id: 'approve_production_deployments', label: 'Approving production deployments', restricts: [] },
  { id: 'delete_source_files', label: 'Deleting source files', restricts: [] },
  { id: 'override_ceo_agent', label: 'Overriding the CEO Agent', restricts: [], enforceable: false },
];

const OFF_LIMITS_PATTERNS = [
  { phrase: 'Changing credentials', re: /(change|reset|rotate|revoke|disable).{0,40}(credential|password|api[- ]?key|token|secret|login|access)/i },
  { phrase: 'Moving money', re: /(move|transfer|send|pay|withdraw|spend|wire).{0,40}(money|funds|payment|cash|balance|bank|transfer|wire|amount)/i },
  { phrase: 'Making legal claims', re: /(make|file|assert|claim|threaten).{0,40}(legal|lawsuit|sue|claim|court|liability|guarantee)/i },
  { phrase: 'Changing pricing', re: /(change|raise|lower|set|update|increase|decrease).{0,40}(price|pricing|rate|fee|plan price|subscription price)/i },
  { phrase: 'Approving production deployments', re: /(approve|authorize|deploy|promote|go.?live).{0,40}(production|deployment|rollout|release to prod)/i },
  { phrase: 'Deleting source files', re: /(delete|remove|destroy|wipe|erase).{0,40}(source file|source code|repository|repo|git history|file)/i },
  { phrase: 'Overriding the CEO Agent', re: /(override|overrule|bypass|overwrite|ignore).{0,40}(ceo|executive|decision|approval|principal)/i },
];

class HermesBridge extends BaseBridge {
  /** Creates the Hermes SDK bridge with fixed identity, allowlists, and gateway client. */
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
      offLimits: OFF_LIMITS,
    });
    // Read at construction time (not module-load time) so tests and
    // installs can (re)configure per instance.
    this._gateway = new HermesGatewayClient(
      process.env.HERMES_GATEWAY_URL || null,
      process.env.HERMES_GATEWAY_API_KEY || null,
    );
    // Injectable audit sink (ADR-009 §4 item 3). Defaults to a console
    // warning; an install should wire this to SupabaseAuditLog (ADR-002).
    this.audit = event => {
      if (process.env.NODE_ENV !== 'test') console.warn('[hermes-audit]', event);
    };
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

  /** @returns {object} Runtime info with executionConnected reflecting real gateway config. */
  getRuntimeInfo() {
    return { ...super.getRuntimeInfo(), executionConnected: this._gateway.isConfigured() };
  }

  /**
   * ADR-009 §4 narrow off_limits stopgap: matches a task's declared intent
   * against Hermes's seven off_limits items before any network call.
   * Heuristic by design — closes the gap for the highest-risk common
   * phrasings, does not claim perfect coverage (the limitation #83 names).
   * @param {object} task A validated Hermes task.
   * @returns {string|null} The matched off_limits phrase, or null.
   */
  checkOffLimits(task) {
    const haystack = [task.goal, task.task, task.description, task.payload]
      .filter(value => value != null)
      .map(value => (typeof value === 'string' ? value : JSON.stringify(value)))
      .join(' ')
      .toLowerCase();
    if (!haystack.trim()) return null;

    const match = OFF_LIMITS_PATTERNS.find(({ re }) => re.test(haystack));
    return match ? match.phrase : null;
  }

  /**
   * Validates, off-limits-checks, and (when a gateway is configured) submits
   * a Hermes task to the real gateway per ADR-001b/ADR-009.
   * @param {object} task Hermes task input.
   * @returns {Promise<object>} Legacy-compatible Hermes result.
   */
  async runTask(task) {
    const validation = this.validateTask(task);
    if (!validation.valid) {
      return {
        agent: 'hermes',
        status: 'blocked',
        summary: 'HermesBridge rejected the task before execution.',
        blockers: [...validation.blockers],
        actions_taken: [],
        timestamp: new Date().toISOString(),
      };
    }

    const offLimitMatch = this.checkOffLimits(task);
    if (offLimitMatch) {
      this.audit({ event: 'off_limits_block', agent: 'hermes', matched: offLimitMatch, task });
      return {
        agent: 'hermes',
        status: 'blocked',
        summary: `HermesBridge blocked the task: it matches off_limits item "${offLimitMatch}".`,
        blockers: [`off_limits match: ${offLimitMatch}`],
        actions_taken: ['Checked task against Hermes off_limits policy.'],
        timestamp: new Date().toISOString(),
      };
    }

    if (!this._gateway.isConfigured()) {
      return {
        agent: 'hermes',
        status: 'queued',
        summary: 'Task validated and queued. Hermes runtime execution is not connected yet.',
        blockers: [],
        actions_taken: [
          'Validated assigned agent.',
          'Validated approver.',
          'Validated authorized project.',
          'Validated authorized task type.',
        ],
        task,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = await this._gateway.submit(task);
      this.audit({ event: 'run_triggered', agent: 'hermes', runId: result.runId });
      return {
        agent: 'hermes',
        status: 'triggered',
        summary: `Task submitted to the Hermes gateway (run ${result.runId}).`,
        run_id: result.runId,
        gateway_status: result.gatewayStatus,
        blockers: [],
        actions_taken: [
          'Validated assigned agent.',
          'Validated approver.',
          'Validated authorized project.',
          'Validated authorized task type.',
          'Checked Hermes off_limits policy.',
          'Submitted task to Hermes gateway POST /v1/runs.',
        ],
        task,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const reason = err instanceof HermesGatewayError
        ? `${err.code}: ${err.message}`
        : String(err && err.message ? err.message : err);
      this.audit({ event: 'run_submit_failed', agent: 'hermes', reason });
      return {
        agent: 'hermes',
        status: 'failed',
        summary: 'Hermes task submission failed.',
        blockers: [reason],
        actions_taken: [
          'Validated assigned agent.',
          'Validated approver.',
          'Validated authorized project.',
          'Validated authorized task type.',
          'Checked Hermes off_limits policy.',
          'Attempted task submission to Hermes gateway POST /v1/runs.',
        ],
        task,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = HermesBridge;

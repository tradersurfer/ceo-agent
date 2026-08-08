const DEFAULT_TIMEOUT_MS = 5000;
const Permissions = require('../sdk/Permissions');
const { InMemoryAuditLog } = require('./WorkflowRuntime');

function matchesType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function validateShape(input, schema) {
  const errors = [];
  for (const [field, rules] of Object.entries(schema || {})) {
    const value = input ? input[field] : undefined;
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required.`);
      continue;
    }
    if (value !== undefined && rules.type && !matchesType(value, rules.type)) {
      errors.push(`${field} must be of type ${rules.type}.`);
    }
  }
  return errors;
}

class SkillExecutor {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.agentResolver = options.agentResolver || null;
    this.audit = options.audit || new InMemoryAuditLog();
  }

  /**
   * Runs a registered skill by name with a timeout, returning a normalized
   * ok/failed result matching WorkflowRuntime's executor vocabulary.
   * @param {string} skillName
   * @param {object} input
   * @param {number} [timeoutMs]
   * @returns {Promise<{status: 'ok'|'failed', output?: any, error?: string}>}
   */
  async run(skillName, input = {}, timeoutMs = DEFAULT_TIMEOUT_MS, context = {}) {
    const skill = this.registry.get(skillName);
    if (!skill) {
      return this._finish('failed', skillName, context, { error: `No skill registered: ${skillName}` });
    }

    if (skill.permissions?.requiresAgentAssignment) {
      const agent = context.agentId && this.agentResolver
        ? this.agentResolver(context.agentId)
        : null;
      const permissions = new Permissions({ tasks: agent ? agent.skills : [] });
      if (!agent || !permissions.isTaskAllowed(skillName)) {
        return this._finish('failed', skillName, context, {
          error: `Agent is not authorized for skill: ${skillName}`,
          reason: 'permission_denied',
        });
      }

      // ADR-010 §2: sibling off_limits check, same shape as the
      // permission_denied check immediately above -- a match hard-blocks,
      // synchronously, through the same _finish()/audit path. Only entries
      // with a non-empty `restricts` and `enforceable !== false` are live;
      // see registry.schema.json's offLimitsEntry doc and ADR-010 §1.2-§1.3
      // for why relational entries (Bucket A) and category-only entries
      // whose real violation depends on an unverifiable qualifier like
      // "unsolicited" (Bucket B) are marked enforceable: false rather than
      // hard-blocked on a bare skill-id match.
      const offLimitsMatch = (agent.offLimits || []).find(entry => entry.enforceable !== false
        && Array.isArray(entry.restricts)
        && entry.restricts.includes(skillName));
      if (offLimitsMatch) {
        return this._finish('failed', skillName, context, {
          error: `Skill is off-limits for this agent: ${skillName} (${offLimitsMatch.label})`,
          reason: 'off_limits_violation',
        });
      }
    }

    const validationErrors = validateShape(input, skill.inputSchema);
    if (validationErrors.length > 0) {
      return this._finish('failed', skillName, context, {
        error: validationErrors.join('; '),
        reason: 'input_validation',
      });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const output = await skill.handler(input, { signal: controller.signal });
        const outputErrors = validateShape(output, skill.outputSchema);
        if (outputErrors.length > 0) {
          return this._finish('failed', skillName, context, {
            error: `Skill output invalid: ${outputErrors.join('; ')}`,
            reason: 'output_validation',
          });
        }
        return this._finish('ok', skillName, context, { output });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return this._finish('failed', skillName, context, {
          error: `Skill timed out after ${timeoutMs}ms: ${skillName}`,
          reason: 'timeout',
        });
      }
      return this._finish('failed', skillName, context, {
        error: err instanceof Error ? err.message : String(err),
        reason: 'handler_error',
      });
    }
  }

  async _finish(status, skillName, context, details) {
    const result = { status, ...details };
    await this.audit.append({
      event: status === 'ok' ? 'skill.execution.succeeded' : 'skill.execution.failed',
      skillName,
      agentId: context.agentId || null,
      // Carried through when the caller supplies it (e.g. a future
      // workflow-triggered or multi-tenant invocation), same conditional
      // pattern WorkflowRuntime uses — omitted when absent so existing
      // in-memory audit entries and consumers are unaffected.
      ...(context.tenantId != null ? { tenantId: context.tenantId } : {}),
      status,
      reason: details.reason || null,
    });
    return result;
  }
}

module.exports = { SkillExecutor, validateShape };

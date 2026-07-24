const DEFAULT_TIMEOUT_MS = 5000;

function validateInput(input, schema) {
  const errors = [];
  for (const [field, rules] of Object.entries(schema || {})) {
    const value = input ? input[field] : undefined;
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required.`);
      continue;
    }
    if (value !== undefined && rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}.`);
    }
  }
  return errors;
}

class SkillExecutor {
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Runs a registered skill by name with a timeout, returning a normalized
   * ok/failed result matching WorkflowRuntime's executor vocabulary.
   * @param {string} skillName
   * @param {object} input
   * @param {number} [timeoutMs]
   * @returns {Promise<{status: 'ok'|'failed', output?: any, error?: string}>}
   */
  async run(skillName, input = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const skill = this.registry.get(skillName);
    if (!skill) {
      return { status: 'failed', error: `No skill registered: ${skillName}` };
    }

    const validationErrors = validateInput(input, skill.inputSchema);
    if (validationErrors.length > 0) {
      return { status: 'failed', error: validationErrors.join('; ') };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const output = await skill.handler(input, { signal: controller.signal });
        return { status: 'ok', output };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { status: 'failed', error: `Skill timed out after ${timeoutMs}ms: ${skillName}` };
      }
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }
}

module.exports = { SkillExecutor };

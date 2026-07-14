const DEFAULT_CONFIG = Object.freeze({
  runtimeId: 'ceo_agent_runtime',
  runtimeName: 'CEO Agent Runtime',
  brandName: 'CEO Agent',
  organization: null,
  owner: null,
  mode: 'local',
  supervisorAgentId: 'ceo_agent',
  defaultDepartment: 'executive',
  departments: [
    'executive',
    'operations',
    'engineering',
    'marketing',
    'client_services',
    'finance',
    'growth',
    'research',
    'design',
  ],
  models: [
    { id: 'gpt', name: 'GPT', provider: 'OpenAI', role: 'systems_architect', enabled: true },
    { id: 'claude', name: 'Claude', provider: 'Anthropic', role: 'creative_reasoning', enabled: true },
    { id: 'codex', name: 'Codex', provider: 'OpenAI', role: 'senior_engineer', enabled: true },
    { id: 'gemini', name: 'Gemini', provider: 'Google', role: 'designer', enabled: true },
    { id: 'grok', name: 'Grok', provider: 'xAI', role: 'rapid_build_research', enabled: false },
    { id: 'openclaw', name: 'OpenClaw', provider: 'OpenClaw', role: 'runtime_connectors', enabled: true },
    { id: 'hermes', name: 'Hermes', provider: 'Nous Research', role: 'operations_execution', enabled: true },
  ],
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

class RuntimeConfig {
  /**
   * Creates runtime configuration by merging overrides onto safe defaults.
   * @param {object} config Configuration overrides.
   */
  constructor(config = {}) {
    this.values = { ...clone(DEFAULT_CONFIG), ...clone(config) };
    this.values.departments = clone(config.departments || DEFAULT_CONFIG.departments);
    this.values.models = clone(config.models || DEFAULT_CONFIG.models);
  }

  /** Gets a configuration value. @param {string} key Key. @returns {*} Value. */
  get(key) {
    return clone(this.values[key]);
  }

  /** Sets a configuration value. @param {string} key Key. @param {*} value Value. @returns {*} Stored value. */
  set(key, value) {
    this.values[key] = clone(value);
    return this.get(key);
  }

  /** Returns all configuration values. @returns {object} Configuration snapshot. */
  getAll() {
    return clone(this.values);
  }

  /** Returns configured department ids. @returns {string[]} Department ids. */
  getDepartments() {
    return clone(this.values.departments);
  }

  /** Returns configured model records. @returns {object[]} Model records. */
  getModels() {
    return clone(this.values.models);
  }

  /** Returns enabled model records. @returns {object[]} Enabled models. */
  getEnabledModels() {
    return this.getModels().filter(model => model.enabled);
  }

  /** Returns the public runtime identity. @returns {object} Runtime identity. */
  getRuntimeIdentity() {
    const { runtimeId, runtimeName, brandName, organization, owner, mode, supervisorAgentId } = this.values;
    return { runtimeId, runtimeName, brandName, organization, owner, mode, supervisorAgentId };
  }
}

RuntimeConfig.DEFAULT_CONFIG = DEFAULT_CONFIG;
module.exports = RuntimeConfig;

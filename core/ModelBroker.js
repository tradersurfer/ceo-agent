const CAPABILITY_RECOMMENDATIONS = Object.freeze({
  software_development: 'codex',
  content_creation: 'claude',
  creative_reasoning: 'claude',
  systems_architecture: 'gpt',
  design_generation: 'gemini',
  image_generation: 'gemini',
  rapid_research: 'grok',
  runtime_connectors: 'openclaw',
  operations_execution: 'hermes',
  workflow_execution: 'hermes',
  cron_create: 'hermes',
});

class ModelBroker {
  /** Creates a model and tool registry. @param {object[]} models Model records. */
  constructor(models = []) {
    this.models = new Map();
    for (const model of models) this.registerModel(model);
  }

  /** Registers or replaces a model. @param {object} model Model record. @returns {object} Stored model. */
  registerModel(model) {
    if (!model || !model.id) throw new TypeError('Model with id is required.');
    const stored = { ...model, enabled: model.enabled !== false };
    this.models.set(stored.id, stored);
    return { ...stored };
  }

  /** Lists all models. @returns {object[]} Model records. */
  listModels() {
    return [...this.models.values()].map(model => ({ ...model }));
  }

  /** Lists enabled models. @returns {object[]} Enabled model records. */
  listEnabledModels() {
    return this.listModels().filter(model => model.enabled);
  }

  /** Gets a model by id. @param {string} id Model id. @returns {object|null} Model or null. */
  getModel(id) {
    const model = this.models.get(id);
    return model ? { ...model } : null;
  }

  /**
   * Gets the resolved API model id for a role at a given cost tier.
   * Falls back to flagship if the requested tier wasn't resolved, and
   * falls back to the model's base apiModelId (legacy single-tier shape)
   * if refreshFromOpenRouter hasn't run with the new tiered shape yet.
   * @param {string} id Model role id (e.g. "claude").
   * @param {'flagship'|'efficient'} tier Cost tier.
   * @returns {string|null} OpenRouter model id, or null if unresolved.
   */
  getApiModelId(id, tier = 'flagship') {
    const model = this.models.get(id);
    if (!model) return null;
    if (model.tiers && model.tiers[tier] && model.tiers[tier].apiModelId) {
      return model.tiers[tier].apiModelId;
    }
    if (model.tiers && model.tiers.flagship && model.tiers.flagship.apiModelId) {
      return model.tiers.flagship.apiModelId;
    }
    return model.apiModelId || null;
  }

  /** Disables a model. @param {string} id Model id. @returns {object|null} Model or null. */
  disableModel(id) {
    const model = this.models.get(id);
    if (!model) return null;
    model.enabled = false;
    return { ...model };
  }

  /** Enables a model. @param {string} id Model id. @returns {object|null} Model or null. */
  enableModel(id) {
    const model = this.models.get(id);
    if (!model) return null;
    model.enabled = true;
    return { ...model };
  }

  /** Finds enabled models by role. @param {string} role Model role. @returns {object[]} Matching models. */
  findByRole(role) {
    return this.listEnabledModels().filter(model => model.role === role);
  }

  /**
   * Recommends an enabled model or tool for a capability without invoking it.
   * @param {string} capability Capability id.
   * @returns {object|null} Recommended model or null.
   */
  recommendForCapability(capability) {
    const modelId = CAPABILITY_RECOMMENDATIONS[String(capability || '').trim().toLowerCase()];
    if (!modelId) return null;
    const model = this.models.get(modelId);
    return model && model.enabled ? { ...model } : null;
  }

  /**
   * Fetches the live OpenRouter model catalog and resolves each API-backed
   * role (claude, gpt, codex, gemini, grok) to both a flagship and an
   * efficient/cheaper tier. Local/non-API entries (hermes, openclaw) are
   * left untouched.
   * @param {import('../sdk/OpenRouterClient')} openRouterClient Client instance.
   * @returns {Promise<object>} The resolved role map that was applied.
   */
  async refreshFromOpenRouter(openRouterClient) {
    const { resolveRoleModels } = require('./ModelResolver');
    const liveModels = await openRouterClient.listModels();
    const resolved = resolveRoleModels(liveModels);

    for (const [role, tiers] of Object.entries(resolved)) {
      const existing = this.models.get(role);
      if (!existing) continue;
      this.models.set(role, {
        ...existing,
        tiers,
        apiModelId: tiers.flagship ? tiers.flagship.apiModelId : existing.apiModelId,
        resolvedAt: new Date().toISOString(),
      });
    }

    return resolved;
  }
}

ModelBroker.CAPABILITY_RECOMMENDATIONS = CAPABILITY_RECOMMENDATIONS;
module.exports = ModelBroker;

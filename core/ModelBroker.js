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
  /** Creates a non-executing model and tool registry. @param {object[]} models Model records. */
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
}

ModelBroker.CAPABILITY_RECOMMENDATIONS = CAPABILITY_RECOMMENDATIONS;
module.exports = ModelBroker;

const RECOGNIZED_CAPABILITIES = Object.freeze([
  'workflow_execution',
  'cron_create',
  'webhook_subscribe',
  'api_trigger',
  'skill_chain',
  'sandbox_execution',
  'content_creation',
  'community_engagement',
  'financial_forecasting',
  'financial_statement_analysis',
  'seo_optimization',
  'software_development',
  'research',
  'design_generation',
  'image_generation',
]);

class CapabilityResolver {
  /**
   * Creates a capability resolver from a registry or agent list.
   * @param {object|object[]} source Registry or agents.
   */
  constructor(source = []) {
    this.recognizedCapabilities = [...RECOGNIZED_CAPABILITIES];
    this.setAgents(source);
  }

  /**
   * Replaces the resolver's agent collection.
   * @param {object|object[]} source Registry or agents.
   * @returns {CapabilityResolver} This resolver.
   */
  setAgents(source = []) {
    if (Array.isArray(source)) this.agents = [...source];
    else if (source && typeof source.listAgents === 'function') this.agents = source.listAgents();
    else if (source && Array.isArray(source.agents)) this.agents = [...source.agents];
    else this.agents = [];
    return this;
  }

  /**
   * Adds or replaces one agent.
   * @param {object} agent Agent record.
   * @returns {object} Agent record.
   */
  addAgent(agent) {
    if (!agent || !agent.id) throw new TypeError('Agent with id is required.');
    const index = this.agents.findIndex(item => item.id === agent.id);
    if (index >= 0) this.agents[index] = agent;
    else this.agents.push(agent);
    return agent;
  }

  /**
   * Scores an agent against a capability.
   * @param {object} agent Agent record.
   * @param {string} capability Requested capability.
   * @returns {number} Match score from zero upward.
   */
  scoreMatch(agent, capability) {
    const target = this._normalize(capability);
    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
    const normalized = capabilities.map(item => this._normalize(item));
    const index = normalized.indexOf(target);
    if (index < 0) return 0;
    let score = 100 - index;
    if (agent.status === 'active' || agent.status === 'ready') score += 10;
    return score;
  }

  /**
   * Returns every matching agent ordered by score.
   * @param {string} capability Requested capability.
   * @returns {object[]} Scored matches.
   */
  findAll(capability) {
    if (!capability || !this.recognizedCapabilities.includes(this._normalize(capability))) return [];
    return this.agents
      .map(agent => ({ agent, score: this.scoreMatch(agent, capability) }))
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score || String(a.agent.id).localeCompare(String(b.agent.id)));
  }

  /**
   * Returns the best agent match for a capability.
   * @param {string} capability Requested capability.
   * @returns {object|null} Best scored match or null.
   */
  findBest(capability) {
    return this.findAll(capability)[0] || null;
  }

  _normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }
}

CapabilityResolver.RECOGNIZED_CAPABILITIES = RECOGNIZED_CAPABILITIES;
module.exports = CapabilityResolver;

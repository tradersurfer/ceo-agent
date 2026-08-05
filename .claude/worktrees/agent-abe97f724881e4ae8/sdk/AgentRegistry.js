const fs = require('fs');
const path = require('path');

class AgentRegistry {
  /**
   * Creates and loads an agent registry.
   * @param {string} registryPath Optional registry JSON path.
   */
  constructor(registryPath = path.resolve(__dirname, '..', 'registry', 'agent-registry.json')) {
    this.registryPath = registryPath;
    this.document = null;
    this.agents = [];
    this.load();
  }

  /**
   * Loads and validates the registry JSON document.
   * @returns {AgentRegistry} This registry instance.
   */
  load() {
    const parsed = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
    const agents = Array.isArray(parsed) ? parsed : parsed.agents;
    if (!Array.isArray(agents)) throw new TypeError('Agent registry must contain an agents array.');
    this.document = parsed;
    this.agents = agents;
    return this;
  }

  /**
   * Finds an agent by id.
   * @param {string} id Agent id.
   * @returns {object|null} Agent record or null.
   */
  findAgent(id) {
    return this.agents.find(agent => agent.id === id) || null;
  }

  /**
   * Lists agent records.
   * @returns {object[]} Agent records.
   */
  listAgents() {
    return this.agents.map(agent => ({ ...agent }));
  }

  /**
   * Lists unique agent departments, falling back to registry lanes.
   * @returns {string[]} Department identifiers.
   */
  listDepartments() {
    return [...new Set(this.agents.map(agent => agent.department || agent.lane).filter(Boolean))];
  }
}

module.exports = AgentRegistry;

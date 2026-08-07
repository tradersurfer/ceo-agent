class Department {
  /** Creates a department definition. @param {object} options Department fields. */
  constructor(options = {}) {
    if (!options.id) throw new TypeError('Department requires an id.');
    this.id = options.id;
    this.name = options.name || options.id;
    this.description = options.description || '';
    this.managerRole = options.managerRole || null;
    this.roles = Array.isArray(options.roles) ? [...new Set(options.roles.map(item => item.id || item))] : [];
    this.agents = Array.isArray(options.agents) ? [...new Set(options.agents.map(item => item.id || item))] : [];
    this.status = options.status || 'active';
  }

  /** Adds a role id. @param {string|object} role Role or id. @returns {string} Role id. */
  addRole(role) {
    const id = role && typeof role === 'object' ? role.id : role;
    if (!id) throw new TypeError('Role id is required.');
    if (!this.roles.includes(id)) this.roles.push(id);
    return id;
  }

  /** Removes a role id. @param {string|object} role Role or id. @returns {boolean} Removal result. */
  removeRole(role) {
    const id = role && typeof role === 'object' ? role.id : role;
    const index = this.roles.indexOf(id);
    if (index < 0) return false;
    this.roles.splice(index, 1);
    return true;
  }

  /** Adds an agent id. @param {string|object} agent Agent or id. @returns {string} Agent id. */
  addAgent(agent) {
    const id = agent && typeof agent === 'object' ? agent.id : agent;
    if (!id) throw new TypeError('Agent id is required.');
    if (!this.agents.includes(id)) this.agents.push(id);
    return id;
  }

  /** Removes an agent id. @param {string|object} agent Agent or id. @returns {boolean} Removal result. */
  removeAgent(agent) {
    const id = agent && typeof agent === 'object' ? agent.id : agent;
    const index = this.agents.indexOf(id);
    if (index < 0) return false;
    this.agents.splice(index, 1);
    return true;
  }

  /** Lists role ids. @returns {string[]} Role ids. */
  listRoles() {
    return [...this.roles];
  }

  /** Lists agent ids. @returns {string[]} Agent ids. */
  listAgents() {
    return [...this.agents];
  }
}

module.exports = Department;

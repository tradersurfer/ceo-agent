class Role {
  /** Creates a business role. @param {object} options Role fields. */
  constructor(options = {}) {
    if (!options.id) throw new TypeError('Role requires an id.');
    this.id = options.id;
    this.title = options.title || options.id;
    this.department = options.department || null;
    this.description = options.description || '';
    this.requiredCapabilities = Array.isArray(options.requiredCapabilities)
      ? [...options.requiredCapabilities]
      : [];
    this.assignedAgent = options.assignedAgent || null;
  }

  /** Assigns an agent to the role. @param {string|object} agent Agent or id. @returns {string} Agent id. */
  assignAgent(agent) {
    const id = agent && typeof agent === 'object' ? agent.id : agent;
    if (!id) throw new TypeError('Agent id is required.');
    this.assignedAgent = id;
    return id;
  }

  /** Unassigns the current agent. @returns {string|null} Previous agent id. */
  unassignAgent() {
    const previous = this.assignedAgent;
    this.assignedAgent = null;
    return previous;
  }

  /** Reports whether the role is filled. @returns {boolean} Filled state. */
  isFilled() {
    return Boolean(this.assignedAgent);
  }
}

module.exports = Role;

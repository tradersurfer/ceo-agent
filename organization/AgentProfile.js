class AgentProfile {
  /** Creates a runtime-independent agent profile. @param {object} options Profile fields. */
  constructor(options = {}) {
    if (!options.id) throw new TypeError('AgentProfile requires an id.');
    this.id = options.id;
    this.name = options.name || options.id;
    this.title = options.title || '';
    this.department = options.department || null;
    this.role = options.role || null;
    this.status = options.status || 'active';
    this.skills = Array.isArray(options.skills) ? [...new Set(options.skills)] : [];
    this.capabilities = Array.isArray(options.capabilities) ? [...new Set(options.capabilities.map(item => item.id || item))] : [];
    this.models = Array.isArray(options.models) ? [...new Set(options.models)] : [];
    this.reportsTo = options.reportsTo || null;
  }

  /** Assigns a role. @param {string|object} role Role or id. @returns {string} Role id. */
  assignRole(role) {
    const id = role && typeof role === 'object' ? role.id : role;
    if (!id) throw new TypeError('Role id is required.');
    this.role = id;
    return id;
  }

  /** Assigns a department. @param {string|object} department Department or id. @returns {string} Department id. */
  assignDepartment(department) {
    const id = department && typeof department === 'object' ? department.id : department;
    if (!id) throw new TypeError('Department id is required.');
    this.department = id;
    return id;
  }

  /** Adds a capability. @param {string|object} capability Capability or id. @returns {string} Capability id. */
  addCapability(capability) {
    const id = capability && typeof capability === 'object' ? capability.id : capability;
    if (!id) throw new TypeError('Capability id is required.');
    if (!this.capabilities.includes(id)) this.capabilities.push(id);
    return id;
  }

  /** Adds a skill. @param {string} skill Skill id or name. @returns {string} Skill. */
  addSkill(skill) {
    if (!skill) throw new TypeError('Skill is required.');
    if (!this.skills.includes(skill)) this.skills.push(skill);
    return skill;
  }

  /** Adds a model assignment. @param {string} model Model name or id. @returns {string} Model. */
  addModel(model) {
    if (!model) throw new TypeError('Model is required.');
    if (!this.models.includes(model)) this.models.push(model);
    return model;
  }

  /** Returns a serializable agent summary. @returns {object} Agent profile summary. */
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      department: this.department,
      role: this.role,
      status: this.status,
      skills: [...this.skills],
      capabilities: [...this.capabilities],
      models: [...this.models],
      reportsTo: this.reportsTo,
    };
  }
}

module.exports = AgentProfile;

class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  /**
   * Registers a named skill.
   * @param {string} name Skill name.
   * @param {object} definition
   * @param {string} definition.capability Capability id this skill provides.
   * @param {object} definition.inputSchema Simple schema: { field: { type, required } }.
   * @param {Function} definition.handler async (input) => result.
   */
  register(name, { capability, inputSchema, handler }) {
    if (!name || typeof name !== 'string') throw new TypeError('Skill name is required.');
    if (typeof handler !== 'function') throw new TypeError('Skill handler must be a function.');
    this.skills.set(name, { name, capability, inputSchema: inputSchema || {}, handler });
  }

  get(name) {
    return this.skills.get(name) || null;
  }

  list() {
    return [...this.skills.values()].map(s => ({ name: s.name, capability: s.capability, inputSchema: s.inputSchema }));
  }

  findByCapability(capability) {
    return [...this.skills.values()].filter(s => s.capability === capability);
  }
}

module.exports = { SkillRegistry };

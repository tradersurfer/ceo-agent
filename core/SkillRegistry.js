class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  /**
   * Registers a named skill.
   * @param {string} name Skill name.
   * @param {object} definition
   * @param {string} definition.capability Capability id this skill provides.
   * @param {string} [definition.description] One-line description of what the
   *   skill does. Surfaced to users via `/skills` and to a future
   *   model-invocation matching pass — not consumed by any such pass today.
   * @param {boolean} [definition.disableModelInvocation] When true, marks
   *   this skill as invocable only via explicit user commands (/name or
   *   @name), never by a model deciding to call it on its own. Stored for a
   *   future model-invocation pathway; nothing in this codebase currently
   *   lets a model invoke a skill on its own, so this has no runtime effect
   *   yet beyond being readable via get()/list().
   * @param {object} definition.inputSchema Simple schema: { field: { type, required } }.
   * @param {Function} definition.handler async (input) => result.
   */
  register(name, { capability, description, disableModelInvocation, inputSchema, outputSchema, permissions, handler }) {
    if (!name || typeof name !== 'string') throw new TypeError('Skill name is required.');
    if (typeof handler !== 'function') throw new TypeError('Skill handler must be a function.');
    this.skills.set(name, {
      name,
      capability,
      description: description || null,
      disableModelInvocation: Boolean(disableModelInvocation),
      inputSchema: inputSchema || {},
      outputSchema: outputSchema || {},
      permissions: permissions || { requiresAgentAssignment: false },
      handler,
    });
  }

  get(name) {
    return this.skills.get(name) || null;
  }

  list() {
    return [...this.skills.values()].map(s => ({
      name: s.name,
      capability: s.capability,
      description: s.description,
      disableModelInvocation: s.disableModelInvocation,
      inputSchema: s.inputSchema,
      outputSchema: s.outputSchema,
      permissions: s.permissions,
    }));
  }

  findByCapability(capability) {
    return [...this.skills.values()].filter(s => s.capability === capability);
  }
}

module.exports = { SkillRegistry };

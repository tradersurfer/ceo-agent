const CATEGORIES = Object.freeze([
  'Operations',
  'Engineering',
  'Finance',
  'Marketing',
  'Research',
  'Growth',
  'Design',
  'Client Services',
  'Executive',
]);

class Capability {
  /**
   * Creates a runtime-independent capability definition.
   * @param {object} options Capability fields.
   */
  constructor(options = {}) {
    if (!options.id) throw new TypeError('Capability requires an id.');
    this.id = options.id;
    this.name = options.name || options.id;
    this.description = options.description || '';
    this.category = options.category || null;
    this.requiredModels = Array.isArray(options.requiredModels) ? [...options.requiredModels] : [];
  }

  /**
   * Checks whether a string or capability refers to this capability.
   * @param {string|Capability|object} candidate Candidate value.
   * @returns {boolean} Match result.
   */
  matches(candidate) {
    if (candidate instanceof Capability) return candidate.id === this.id;
    if (candidate && typeof candidate === 'object') return candidate.id === this.id;
    const value = String(candidate || '').trim().toLowerCase();
    return value === this.id.toLowerCase() || value === this.name.toLowerCase();
  }

  /** Returns a serializable capability record. @returns {object} Capability data. */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      requiredModels: [...this.requiredModels],
    };
  }
}

Capability.CATEGORIES = CATEGORIES;
module.exports = Capability;

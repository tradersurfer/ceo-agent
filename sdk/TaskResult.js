class TaskResult {
  /**
   * Creates a structured task result.
   * @param {object} input Result fields.
   */
  constructor(input = {}) {
    this.status = input.status || 'completed';
    this.summary = input.summary || '';
    this.actions_taken = Array.isArray(input.actions_taken) ? [...input.actions_taken] : [];
    this.warnings = Array.isArray(input.warnings) ? [...input.warnings] : [];
    this.errors = Array.isArray(input.errors) ? [...input.errors] : [];
    this.timestamp = input.timestamp || new Date().toISOString();
    this.agent = input.agent || null;
  }

  /**
   * Returns a plain serializable representation of the result.
   * @returns {object} Result data.
   */
  toJSON() {
    return {
      status: this.status,
      summary: this.summary,
      actions_taken: [...this.actions_taken],
      warnings: [...this.warnings],
      errors: [...this.errors],
      timestamp: this.timestamp,
      agent: this.agent,
    };
  }
}

module.exports = TaskResult;

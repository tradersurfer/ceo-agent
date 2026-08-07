const { randomUUID } = require('crypto');
const { Priorities, Statuses } = require('./constants');

class Task {
  /**
   * Creates a normalized SDK task.
   * @param {object} input Task fields.
   */
  constructor(input = {}) {
    this.id = input.id || randomUUID();
    this.agent = input.agent || input.assignedAgent || null;
    this.project = input.project || null;
    this.goal = input.goal || '';
    this.task = input.task || '';
    this.type = input.type || null;
    this.priority = input.priority || Priorities.NORMAL;
    this.deadline = input.deadline || null;
    this.status = input.status || Statuses.CREATED;
    this.approved_by = input.approved_by || null;
    this.metadata = input.metadata && typeof input.metadata === 'object'
      ? { ...input.metadata }
      : {};
    this.created = input.created || new Date().toISOString();
  }

  /**
   * Returns a plain serializable representation of the task.
   * @returns {object} Task data.
   */
  toJSON() {
    return { ...this, metadata: { ...this.metadata } };
  }
}

module.exports = Task;

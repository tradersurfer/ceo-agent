class Permissions {
  /**
   * Creates an allowlist-based permission policy.
   * @param {object} options Permission allowlists.
   */
  constructor(options = {}) {
    this.approvers = new Set(options.approvers || options.approvedBy || []);
    this.projects = new Set(options.projects || options.allowedProjects || []);
    this.tasks = new Set(options.tasks || options.allowedTasks || []);
  }

  /**
   * Checks whether an identity may approve work.
   * @param {string} approver Approver id.
   * @returns {boolean} Approval decision.
   */
  isApproved(approver) {
    return this.approvers.has('*') || this.approvers.has(approver);
  }

  /**
   * Checks whether a project is allowed.
   * @param {string} project Project id.
   * @returns {boolean} Project decision.
   */
  isProjectAllowed(project) {
    return this.projects.has('*') || this.projects.has(project);
  }

  /**
   * Checks whether a task type is allowed.
   * @param {string} taskType Task type.
   * @returns {boolean} Task decision.
   */
  isTaskAllowed(taskType) {
    return this.tasks.has('*') || this.tasks.has(taskType);
  }
}

module.exports = Permissions;

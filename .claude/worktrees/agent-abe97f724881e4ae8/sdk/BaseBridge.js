const Task = require('./Task');
const TaskResult = require('./TaskResult');
const Permissions = require('./Permissions');
const { Statuses } = require('./constants');

class BaseBridge {
  /**
   * Creates a runtime-neutral validation bridge.
   * Supports both top-level bridge fields and the original nested options.
   * @param {object} options Bridge identity, permissions, and runtime metadata.
   */
  constructor(options = {}) {
    this.id = options.id || options.agentId || null;
    this.agentId = this.id;
    this.name = options.name || null;
    this.title = options.title || null;
    this.reportsTo = options.reportsTo || options.reports_to || null;
    this.runtimePath = options.runtimePath || null;
    this.applicationPath = options.applicationPath || null;

    const permissionOptions = options.permissions || {};
    this.permissions = permissionOptions instanceof Permissions
      ? permissionOptions
      : new Permissions({
          approvers: options.allowedApprovers || permissionOptions.approvers || permissionOptions.approvedBy || [],
          projects: options.allowedProjects || permissionOptions.projects || permissionOptions.allowedProjects || [],
          tasks: options.allowedTaskTypes || permissionOptions.tasks || permissionOptions.allowedTasks || [],
        });

    this.allowedApprovers = options.allowedApprovers
      ? [...options.allowedApprovers]
      : [...this.permissions.approvers];
    this.allowedProjects = options.allowedProjects
      ? [...options.allowedProjects]
      : [...this.permissions.projects];
    this.allowedTaskTypes = options.allowedTaskTypes
      ? [...options.allowedTaskTypes]
      : [...this.permissions.tasks];
    this.runtimeInfo = options.runtimeInfo && typeof options.runtimeInfo === 'object'
      ? { ...options.runtimeInfo }
      : {};
    this.executionConnected = false;
  }

  /**
   * Validates task shape, assignment, project, and permissions.
   * @param {Task|object} input Task input.
   * @returns {object} Validation result and normalized task.
   */
  validateTask(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, errors: ['Task must be an object.'], task: null };
    }

    const task = input instanceof Task ? input : new Task(input);
    const errors = [];
    if (!task.agent) errors.push('Task agent is required.');
    if (this.agentId && task.agent !== this.agentId) errors.push('Task is assigned to another agent.');
    if (!task.project) errors.push('Task project is required.');
    if (!task.goal) errors.push('Task goal is required.');
    if (!task.task) errors.push('Task description is required.');
    if (!this.validateProject(task.project)) errors.push('Task project is not allowed.');
    errors.push(...this.validatePermissions(task));
    return { valid: errors.length === 0, errors, task };
  }

  /**
   * Validates project access.
   * @param {string} project Project id.
   * @returns {boolean} Project decision.
   */
  validateProject(project) {
    return this.permissions.isProjectAllowed(project);
  }

  /**
   * Validates approver and task-type permissions.
   * @param {Task|object} task Task input.
   * @returns {string[]} Permission errors.
   */
  validatePermissions(task) {
    const errors = [];
    const taskType = task.type || (task.metadata && task.metadata.taskType) || null;
    if (!this.permissions.isApproved(task.approved_by)) errors.push('Task approver is not allowed.');
    if (!this.permissions.isTaskAllowed(taskType)) errors.push('Task type is not allowed.');
    return errors;
  }

  /**
   * Returns non-secret identity and runtime metadata.
   * @returns {object} Runtime information.
   */
  getRuntimeInfo() {
    return {
      agent: this.agentId,
      id: this.id,
      name: this.name,
      title: this.title,
      reportsTo: this.reportsTo,
      runtimePath: this.runtimePath,
      applicationPath: this.applicationPath,
      allowedApprovers: [...this.allowedApprovers],
      allowedProjects: [...this.allowedProjects],
      allowedTaskTypes: [...this.allowedTaskTypes],
      ...this.runtimeInfo,
      executionConnected: false,
    };
  }

  /**
   * Validates a task and returns a structured placeholder result.
   * @param {Task|object} input Task input.
   * @returns {Promise<TaskResult>} Blocked or queued placeholder result.
   */
  async execute(input) {
    const validation = this.validateTask(input);
    if (!validation.valid) {
      return new TaskResult({
        status: Statuses.BLOCKED,
        summary: 'Bridge validation failed; no runtime execution occurred.',
        errors: validation.errors,
        agent: this.agentId,
      });
    }
    return new TaskResult({
      status: Statuses.QUEUED,
      summary: 'Task validated and queued; runtime execution is not connected.',
      actions_taken: ['Validated task.', 'Validated project.', 'Validated permissions.'],
      agent: this.agentId,
    });
  }
}

module.exports = BaseBridge;

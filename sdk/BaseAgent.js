const Logger = require('./Logger');
const Permissions = require('./Permissions');
const MemoryManager = require('./MemoryManager');
const HealthMonitor = require('./HealthMonitor');
const Heartbeat = require('./Heartbeat');
const TaskResult = require('./TaskResult');
const { HealthStates, Statuses } = require('./constants');

class BaseAgent {
  /**
   * Creates a runtime-neutral agent foundation.
   * @param {object} options Agent identity and dependency options.
   */
  constructor(options = {}) {
    if (!options.id) throw new TypeError('BaseAgent requires an id.');
    this.identity = options.identity || {};
    this.id = options.id;
    this.title = options.title || '';
    this.department = options.department || '';
    this.reports_to = options.reports_to || null;
    this.logger = options.logger || new Logger({ agent: this.id });
    this.permissions = options.permissions instanceof Permissions
      ? options.permissions
      : new Permissions(options.permissions || {});
    this.memory = options.memory || new MemoryManager();
    this.healthMonitor = options.healthMonitor || new HealthMonitor();
    this.heartbeat = options.heartbeat || new Heartbeat({
      intervalMs: options.heartbeatIntervalMs,
      onPulse: timestamp => this.healthMonitor.recordHeartbeat(timestamp),
    });
    this.initialized = false;
  }

  /**
   * Initializes shared agent services without runtime-specific work.
   * @returns {Promise<object>} Current agent status.
   */
  async initialize() {
    this.healthMonitor.setState(HealthStates.HEALTHY);
    this.heartbeat.start();
    this.initialized = true;
    this.logger.info('Agent initialized.');
    return this.reportStatus();
  }

  /**
   * Provides a safe execution placeholder for subclasses.
   * @param {object} task Task input.
   * @returns {Promise<TaskResult>} Structured not-implemented result.
   */
  async execute(task) {
    this.logger.warn('BaseAgent execution placeholder invoked.', { taskId: task && task.id });
    return new TaskResult({
      status: Statuses.BLOCKED,
      summary: 'Execution is not implemented by BaseAgent.',
      warnings: ['A runtime-specific agent subclass must implement execute().'],
      agent: this.id,
    });
  }

  /**
   * Stops shared agent services.
   * @returns {Promise<object>} Current agent status.
   */
  async shutdown() {
    this.heartbeat.stop();
    this.healthMonitor.setState(HealthStates.OFFLINE);
    this.initialized = false;
    this.logger.info('Agent shut down.');
    return this.reportStatus();
  }

  /**
   * Reports identity and service health to the orchestration layer.
   * @returns {object} Agent status report.
   */
  reportStatus() {
    return {
      identity: { ...this.identity },
      id: this.id,
      title: this.title,
      department: this.department,
      reports_to: this.reports_to,
      initialized: this.initialized,
      heartbeat: this.heartbeat.status(),
      health: this.healthMonitor.status(),
    };
  }
}

module.exports = BaseAgent;

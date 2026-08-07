const TaskRouter = require('./TaskRouter');
const CapabilityResolver = require('./CapabilityResolver');
const Logger = require('./Logger');
const HealthMonitor = require('./HealthMonitor');
const { ExecutiveStatuses, HealthStates } = require('./constants');

class Supervisor {
  /**
   * Creates the CEO Agent executive supervisor without runtime execution.
   * @param {object} options Supervisor dependencies.
   */
  constructor(options = {}) {
    this.id = options.id || 'ceo_agent';
    this.agentRegistry = options.agentRegistry || null;
    const initialAgents = this._extractAgents(this.agentRegistry);
    this.agents = new Map(initialAgents.filter(agent => agent && agent.id).map(agent => [agent.id, agent]));
    this.capabilityResolver = options.capabilityResolver || new CapabilityResolver(initialAgents);
    this.taskRouter = options.taskRouter || new TaskRouter(initialAgents, this.capabilityResolver);
    this.logger = options.logger || new Logger({ agent: this.id });
    this.healthMonitor = options.healthMonitor || new HealthMonitor();
    this.healthMonitor.setState(HealthStates.HEALTHY);
  }

  /**
   * Registers or replaces an agent under supervision.
   * @param {object} agent Agent record.
   * @returns {object} Structured registration result.
   */
  registerAgent(agent) {
    if (!agent || !agent.id) {
      return { status: ExecutiveStatuses.BLOCKED, reason: 'Agent with id is required.', timestamp: new Date().toISOString() };
    }
    this.agents.set(agent.id, agent);
    this.capabilityResolver.addAgent(agent);
    this.taskRouter.addAgent(agent);
    this.logger.info('Agent registered.', { agentId: agent.id });
    return {
      status: ExecutiveStatuses.READY,
      supervisor: this.id,
      agentId: agent.id,
      agent,
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Lists supervised agents.
   * @returns {object[]} Agent records.
   */
  listAgents() {
    return [...this.agents.values()];
  }

  /**
   * Gets a supervised agent by id.
   * @param {string} agentId Agent id.
   * @returns {object|null} Agent record or null.
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Receives and routes a task without executing any runtime.
   * @param {object} task Task request.
   * @returns {object} Structured routing result.
   */
  receiveTask(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      return {
        status: ExecutiveStatuses.BLOCKED,
        supervisor: this.id,
        reason: 'Task must be an object.',
        executionConnected: false,
        timestamp: new Date().toISOString(),
      };
    }
    this.logger.info('Task received.', { taskId: task.id || null });
    return this.routeTask(task);
  }

  /**
   * Routes a task through the configured task router.
   * @param {object} task Task request.
   * @returns {object} Structured routing decision.
   */
  routeTask(task) {
    const decision = this.taskRouter.route(task);
    this.logger.info('Task routing decision.', { status: decision.status, agentId: decision.agentId });
    return { supervisor: this.id, ...decision };
  }

  /**
   * Reports executive-layer health and supervised agents.
   * @returns {object} Structured supervisor status.
   */
  reportStatus() {
    return {
      status: ExecutiveStatuses.READY,
      supervisor: this.id,
      agentCount: this.agents.size,
      agents: this.listAgents().map(agent => agent.id),
      health: this.healthMonitor.status(),
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Creates a structured escalation for the CEO Agent or a human operator.
   * @param {object} task Task requiring escalation.
   * @param {string} reason Escalation reason.
   * @returns {object} Structured escalation.
   */
  escalate(task, reason) {
    const escalation = {
      status: ExecutiveStatuses.ESCALATED,
      supervisor: this.id,
      task,
      reason,
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
    this.logger.warn('Task escalated.', { reason });
    return escalation;
  }

  _extractAgents(source) {
    if (Array.isArray(source)) return [...source];
    if (source && typeof source.listAgents === 'function') return source.listAgents();
    if (source && Array.isArray(source.agents)) return [...source.agents];
    return [];
  }
}

module.exports = Supervisor;

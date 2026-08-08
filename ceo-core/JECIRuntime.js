const RuntimeConfig = require('./RuntimeConfig');
const DepartmentManager = require('./DepartmentManager');
const ModelBroker = require('./ModelBroker');
const Supervisor = require('../sdk/Supervisor');
const Logger = require('../sdk/Logger');

class JECIRuntime {
  /**
   * Creates the reusable CEO Agent organization runtime without connecting providers.
   * @param {object} options Runtime configuration and SDK dependencies.
   */
  constructor(options = {}) {
    this.config = options.config instanceof RuntimeConfig
      ? options.config
      : new RuntimeConfig(options.config || {});
    this.departmentManager = new DepartmentManager(this.config.getDepartments());
    this.modelBroker = new ModelBroker(this.config.getModels());
    this.logger = options.logger || new Logger({ agent: this.config.get('supervisorAgentId') });
    this.supervisor = options.supervisor || new Supervisor({
      id: this.config.get('supervisorAgentId'),
      agentRegistry: options.registry || null,
      taskRouter: options.taskRouter || null,
      capabilityResolver: options.capabilityResolver || null,
      logger: this.logger,
    });
    this.status = 'created';
    this.startedAt = null;
  }

  /**
   * Initializes runtime metadata and returns an organization summary.
   * @returns {object} Initialization result.
   */
  initialize() {
    this.status = 'ready';
    this.startedAt = new Date().toISOString();
    this.logger.info('CEO Agent runtime initialized.', { runtimeId: this.config.get('runtimeId') });
    return {
      status: this.status,
      identity: this.getIdentity(),
      departments: this.departmentManager.listDepartments().map(department => ({
        id: department.id,
        name: department.name,
        status: department.status,
        agentCount: department.agents.length,
      })),
    };
  }

  /** Returns public runtime identity. @returns {object} Runtime identity. */
  getIdentity() {
    return this.config.getRuntimeIdentity();
  }

  /** Returns runtime status and organization summaries. @returns {object} Runtime status. */
  getStatus() {
    const identity = this.getIdentity();
    return {
      runtimeId: identity.runtimeId,
      runtimeName: identity.runtimeName,
      brandName: identity.brandName,
      organization: identity.organization,
      status: this.status,
      startedAt: this.startedAt,
      departments: this.departmentManager.listDepartments(),
      enabledModels: this.modelBroker.listEnabledModels(),
    };
  }

  /**
   * Registers an agent with supervision and its declared department.
   * @param {object} agent Agent record.
   * @returns {object} Structured registration result.
   */
  registerAgent(agent) {
    if (!agent || !agent.id) {
      return { status: 'blocked', reason: 'Agent with id is required.', timestamp: new Date().toISOString() };
    }
    const supervisorResult = this.supervisor
      ? this.supervisor.registerAgent(agent)
      : { status: 'blocked', reason: 'Supervisor not configured.' };
    const departmentAssignment = agent.department
      ? this.departmentManager.assignAgentToDepartment(agent, agent.department)
      : null;
    const blocked = supervisorResult.status === 'blocked'
      || (departmentAssignment && departmentAssignment.status === 'blocked');
    return {
      status: blocked ? 'blocked' : 'registered',
      agentId: agent.id,
      supervisor: supervisorResult,
      department: departmentAssignment,
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Routes a task through the supervisor without executing it.
   * @param {object} task Task routing request.
   * @returns {object} Structured routing result.
   */
  routeTask(task) {
    if (!this.supervisor) {
      return {
        status: 'blocked',
        reason: 'Supervisor not configured.',
        executionConnected: false,
        timestamp: new Date().toISOString(),
      };
    }
    return this.supervisor.receiveTask(task);
  }

  /**
   * Recommends a registered model or tool for a capability.
   * @param {string} capability Capability id.
   * @returns {object|null} Recommendation or null.
   */
  recommendModelForCapability(capability) {
    return this.modelBroker.recommendForCapability(capability);
  }

  /** Returns the department organization chart. @returns {object} Organization chart. */
  getOrgChart() {
    return this.departmentManager.getOrgChart();
  }

  /** Sets the runtime offline without stopping external services. @returns {object} Runtime status. */
  shutdown() {
    this.status = 'offline';
    this.logger.info('CEO Agent runtime shut down.', { runtimeId: this.config.get('runtimeId') });
    return this.getStatus();
  }
}

module.exports = JECIRuntime;

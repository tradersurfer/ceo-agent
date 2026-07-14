const CapabilityResolver = require('./CapabilityResolver');
const { Departments, ExecutiveStatuses } = require('./constants');

const SUPPORTED_DEPARTMENTS = Object.freeze([
  Departments.EXECUTIVE,
  Departments.OPERATIONS,
  Departments.ENGINEERING,
  Departments.MARKETING,
  Departments.CLIENT_SERVICES,
  Departments.FINANCE,
  Departments.GROWTH,
  Departments.RESEARCH,
  Departments.DESIGN,
]);

class TaskRouter {
  /**
   * Creates a non-executing task router from a registry or agent list.
   * @param {object|object[]} source Registry or agents.
   * @param {CapabilityResolver|null} capabilityResolver Optional resolver.
   */
  constructor(source = [], capabilityResolver = null) {
    this.setAgents(source);
    this.capabilityResolver = capabilityResolver || new CapabilityResolver(this.agents);
  }

  /**
   * Replaces the router's agent collection.
   * @param {object|object[]} source Registry or agents.
   * @returns {TaskRouter} This router.
   */
  setAgents(source = []) {
    if (Array.isArray(source)) this.agents = [...source];
    else if (source && typeof source.listAgents === 'function') this.agents = source.listAgents();
    else if (source && Array.isArray(source.agents)) this.agents = [...source.agents];
    else this.agents = [];
    if (this.capabilityResolver) this.capabilityResolver.setAgents(this.agents);
    return this;
  }

  /**
   * Adds or replaces one routable agent.
   * @param {object} agent Agent record.
   * @returns {object} Agent record.
   */
  addAgent(agent) {
    if (!agent || !agent.id) throw new TypeError('Agent with id is required.');
    const index = this.agents.findIndex(item => item.id === agent.id);
    if (index >= 0) this.agents[index] = agent;
    else this.agents.push(agent);
    if (this.capabilityResolver) this.capabilityResolver.addAgent(agent);
    return agent;
  }

  /**
   * Routes by explicit agent, department, then capability without executing work.
   * @param {object} task Task routing request.
   * @returns {object} Structured routing decision.
   */
  route(task = {}) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      return this._blocked(task, 'Task must be an object.');
    }

    const assignedAgent = task.assignedAgent || task.agent;
    if (assignedAgent) {
      const agent = this.agents.find(item => item.id === assignedAgent);
      return agent
        ? this._routed(task, agent, 'assignedAgent')
        : this._blocked(task, `Assigned agent not found: ${assignedAgent}`);
    }

    if (task.department) {
      const department = this._normalizeDepartment(task.department);
      if (!SUPPORTED_DEPARTMENTS.includes(department)) {
        return this._blocked(task, `Unsupported department: ${task.department}`);
      }
      const agent = this.agents.find(item => this._normalizeDepartment(item.department || item.lane) === department);
      return agent
        ? this._routed(task, agent, 'department')
        : this._blocked(task, `No agent found for department: ${department}`);
    }

    if (task.capability) {
      const match = this.capabilityResolver.findBest(task.capability);
      return match
        ? this._routed(task, match.agent, 'capability', { capability: task.capability, score: match.score })
        : this._blocked(task, `No agent found for capability: ${task.capability}`);
    }

    return this._blocked(task, 'No assignedAgent, department, or capability was provided.');
  }

  _routed(task, agent, routeBy, extra = {}) {
    return {
      status: ExecutiveStatuses.ROUTED,
      routeBy,
      agentId: agent.id,
      agent,
      task,
      ...extra,
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
  }

  _blocked(task, reason) {
    return {
      status: ExecutiveStatuses.BLOCKED,
      routeBy: null,
      agentId: null,
      task,
      reason,
      executionConnected: false,
      timestamp: new Date().toISOString(),
    };
  }

  _normalizeDepartment(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
      executive_orchestration: Departments.EXECUTIVE,
      operations_execution: Departments.OPERATIONS,
      ops_execution: Departments.OPERATIONS,
      build_dev: Departments.ENGINEERING,
      content: Departments.MARKETING,
      content_creation: Departments.MARKETING,
      community: Departments.CLIENT_SERVICES,
      community_engagement: Departments.CLIENT_SERVICES,
      financial_forecasting: Departments.FINANCE,
      financial_statement_analysis: Departments.FINANCE,
      seo_and_visibility: Departments.GROWTH,
    };
    return aliases[normalized] || normalized;
  }
}

TaskRouter.SUPPORTED_DEPARTMENTS = SUPPORTED_DEPARTMENTS;
module.exports = TaskRouter;

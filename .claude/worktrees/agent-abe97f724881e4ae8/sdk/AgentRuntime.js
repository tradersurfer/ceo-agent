const MemoryStore = require('./MemoryStore');
const Logger = require('./Logger');
const TaskQueue = require('./TaskQueue');
const HealthCheck = require('./HealthCheck');

class AgentRuntime {
  constructor() {
    this.memory = new MemoryStore();
    this.taskQueue = new TaskQueue();
    this.agents = new Map();
  }

  register(agent) {
    this.agents.set(agent.id, agent);
    return agent;
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  createLogger(agentId) {
    return new Logger(agentId);
  }

  async startAll() {
    for (const agent of this.agents.values()) {
      await agent.start();
    }
  }

  async routeTask(task) {
    const agent = this.getAgent(task.assignedAgent);

    if (!agent) {
      throw new Error(`No agent found for: ${task.assignedAgent}`);
    }

    return agent.handleTask(task);
  }

  async health() {
    const healthCheck = new HealthCheck([...this.agents.values()]);
    return healthCheck.run();
  }
}

module.exports = AgentRuntime;
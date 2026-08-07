class HealthCheck {
  constructor(agents = []) {
    this.agents = agents;
  }

  async run() {
    const results = [];

    for (const agent of this.agents) {
      try {
        const status = await agent.heartbeat();
        results.push(status);
      } catch (err) {
        results.push({
          agent: agent.id,
          status: 'error',
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }
}

module.exports = HealthCheck;
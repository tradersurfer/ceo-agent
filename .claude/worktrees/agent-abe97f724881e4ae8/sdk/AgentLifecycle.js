const { LifecycleStates } = require('./constants');

class AgentLifecycle {
  /** Creates an empty in-memory lifecycle tracker. */
  constructor() {
    this.states = new Map();
  }

  /**
   * Sets an agent lifecycle state.
   * @param {string} agentId Agent id.
   * @param {string} state Supported lifecycle state.
   * @param {object} details Optional state details.
   * @returns {object} Updated state record.
   */
  setState(agentId, state, details = {}) {
    if (!agentId) throw new TypeError('agentId is required.');
    if (!Object.values(LifecycleStates).includes(state)) {
      throw new RangeError(`Unsupported lifecycle state: ${state}`);
    }
    const record = {
      agentId,
      state,
      reason: details.reason || null,
      updated: new Date().toISOString(),
    };
    this.states.set(agentId, record);
    return { ...record };
  }

  /**
   * Returns an agent lifecycle record.
   * @param {string} agentId Agent id.
   * @returns {object|null} State record or null.
   */
  getState(agentId) {
    const record = this.states.get(agentId);
    return record ? { ...record } : null;
  }

  /** Marks an agent ready. @param {string} agentId Agent id. @returns {object} State record. */
  markReady(agentId) {
    return this.setState(agentId, LifecycleStates.READY);
  }

  /** Marks an agent busy. @param {string} agentId Agent id. @returns {object} State record. */
  markBusy(agentId) {
    return this.setState(agentId, LifecycleStates.BUSY);
  }

  /** Marks an agent offline. @param {string} agentId Agent id. @returns {object} State record. */
  markOffline(agentId) {
    return this.setState(agentId, LifecycleStates.OFFLINE);
  }

  /**
   * Marks an agent failed with a reason.
   * @param {string} agentId Agent id.
   * @param {string} reason Failure reason.
   * @returns {object} State record.
   */
  markFailed(agentId, reason) {
    return this.setState(agentId, LifecycleStates.FAILED, { reason });
  }

  /**
   * Lists all lifecycle records.
   * @returns {object[]} State records.
   */
  listStates() {
    return [...this.states.values()].map(record => ({ ...record }));
  }
}

module.exports = AgentLifecycle;

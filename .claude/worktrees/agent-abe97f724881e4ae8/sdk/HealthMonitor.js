const { HealthStates } = require('./constants');

class HealthMonitor {
  /** Creates a health monitor in the offline state. */
  constructor() {
    this.state = HealthStates.OFFLINE;
    this.lastHeartbeat = null;
    this.details = {};
  }

  /**
   * Sets the current health state.
   * @param {string} state One of HealthStates.
   * @param {object} details Optional diagnostic details.
   * @returns {object} Current health status.
   */
  setState(state, details = {}) {
    if (!Object.values(HealthStates).includes(state)) {
      throw new RangeError(`Unknown health state: ${state}`);
    }
    this.state = state;
    this.details = details && typeof details === 'object' ? { ...details } : {};
    return this.status();
  }

  /**
   * Records a heartbeat timestamp.
   * @param {string} timestamp ISO timestamp.
   * @returns {object} Current health status.
   */
  recordHeartbeat(timestamp = new Date().toISOString()) {
    this.lastHeartbeat = timestamp;
    if (this.state === HealthStates.OFFLINE) this.state = HealthStates.HEALTHY;
    return this.status();
  }

  /**
   * Returns a snapshot of health state.
   * @returns {object} Health snapshot.
   */
  status() {
    return {
      state: this.state,
      healthy: this.state === HealthStates.HEALTHY,
      busy: this.state === HealthStates.BUSY,
      offline: this.state === HealthStates.OFFLINE,
      degraded: this.state === HealthStates.DEGRADED,
      lastHeartbeat: this.lastHeartbeat,
      details: { ...this.details },
    };
  }
}

module.exports = HealthMonitor;

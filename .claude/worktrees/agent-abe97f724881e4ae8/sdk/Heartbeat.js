class Heartbeat {
  /**
   * Creates a controllable heartbeat without starting it.
   * @param {object} options Heartbeat options.
   */
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 30000;
    this.onPulse = typeof options.onPulse === 'function' ? options.onPulse : null;
    this.timer = null;
    this.running = false;
    this.lastPulse = null;
    this.pulseCount = 0;
  }

  /**
   * Starts periodic heartbeat pulses.
   * @returns {object} Heartbeat status.
   */
  start() {
    if (this.running) return this.status();
    this.running = true;
    this.pulse();
    this.timer = setInterval(() => this.pulse(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.status();
  }

  /**
   * Stops periodic heartbeat pulses.
   * @returns {object} Heartbeat status.
   */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    return this.status();
  }

  /**
   * Records and emits one heartbeat pulse.
   * @returns {string} Pulse timestamp.
   */
  pulse() {
    this.lastPulse = new Date().toISOString();
    this.pulseCount += 1;
    if (this.onPulse) this.onPulse(this.lastPulse);
    return this.lastPulse;
  }

  /**
   * Returns heartbeat state.
   * @returns {object} Heartbeat snapshot.
   */
  status() {
    return {
      running: this.running,
      lastPulse: this.lastPulse,
      pulseCount: this.pulseCount,
      intervalMs: this.intervalMs,
    };
  }
}

module.exports = Heartbeat;

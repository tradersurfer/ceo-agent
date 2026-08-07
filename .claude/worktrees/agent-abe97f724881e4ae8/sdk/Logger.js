class Logger {
  /**
   * Creates an in-memory structured logger.
   * @param {object} options Logger options.
   */
  constructor(options = {}) {
    this.agent = options.agent || options.agentId || null;
    this.minimumLevel = options.minimumLevel || 'debug';
    this.entries = [];
  }

  /**
   * Records an informational entry.
   * @param {string} message Log message.
   * @param {object} metadata Structured metadata.
   * @returns {object} Created entry.
   */
  info(message, metadata = {}) {
    return this._write('info', message, metadata);
  }

  /**
   * Records a warning entry.
   * @param {string} message Log message.
   * @param {object} metadata Structured metadata.
   * @returns {object} Created entry.
   */
  warn(message, metadata = {}) {
    return this._write('warn', message, metadata);
  }

  /**
   * Records an error entry.
   * @param {string} message Log message.
   * @param {object} metadata Structured metadata.
   * @returns {object} Created entry.
   */
  error(message, metadata = {}) {
    return this._write('error', message, metadata);
  }

  /**
   * Records a debug entry.
   * @param {string} message Log message.
   * @param {object} metadata Structured metadata.
   * @returns {object} Created entry.
   */
  debug(message, metadata = {}) {
    return this._write('debug', message, metadata);
  }

  /**
   * Returns structured entries, optionally filtered by level.
   * @param {string|null} level Optional level.
   * @returns {object[]} Log entries.
   */
  getEntries(level = null) {
    const entries = level ? this.entries.filter(entry => entry.level === level) : this.entries;
    return entries.map(entry => ({ ...entry, metadata: { ...entry.metadata } }));
  }

  _write(level, message, metadata) {
    const entry = {
      level,
      message: String(message),
      metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
      agent: this.agent,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return { ...entry, metadata: { ...entry.metadata } };
  }
}

module.exports = Logger;

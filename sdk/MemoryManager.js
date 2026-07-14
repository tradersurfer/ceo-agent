class MemoryManager {
  /** Creates a placeholder in-memory manager with no runtime persistence. */
  constructor() {
    this.records = new Map();
  }

  /**
   * Saves a value in placeholder memory.
   * @param {string} key Record key.
   * @param {*} value Record value.
   * @returns {object} Saved record.
   */
  save(key, value) {
    const record = { key, value, updated: new Date().toISOString() };
    this.records.set(key, record);
    return { ...record };
  }

  /**
   * Loads a value from placeholder memory.
   * @param {string} key Record key.
   * @returns {*|null} Stored value or null.
   */
  load(key) {
    const record = this.records.get(key);
    return record ? record.value : null;
  }

  /**
   * Searches keys and string values in placeholder memory.
   * @param {string} query Search text.
   * @returns {object[]} Matching records.
   */
  search(query) {
    const needle = String(query).toLowerCase();
    return [...this.records.values()]
      .filter(record => `${record.key} ${String(record.value)}`.toLowerCase().includes(needle))
      .map(record => ({ ...record }));
  }

  /**
   * Summarizes the current placeholder memory collection.
   * @returns {object} Memory summary.
   */
  summarize() {
    return {
      count: this.records.size,
      keys: [...this.records.keys()],
      persistent: false,
    };
  }
}

module.exports = MemoryManager;

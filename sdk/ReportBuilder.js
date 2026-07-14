class ReportBuilder {
  /**
   * Creates an executive report builder for Agent JECI.
   * @param {object} options Report options.
   */
  constructor(options = {}) {
    this.title = options.title || 'JECI Executive Operations Report';
    this.audience = options.audience || 'agent_jeci';
    this.sections = [];
  }

  /**
   * Adds a named section to the report.
   * @param {string} title Section title.
   * @param {*} content Section content.
   * @returns {ReportBuilder} This builder.
   */
  addSection(title, content) {
    this.sections.push({ title, content });
    return this;
  }

  /**
   * Builds a structured executive report.
   * @param {object} summary Executive summary data.
   * @returns {object} Executive report.
   */
  buildExecutiveReport(summary = {}) {
    return {
      title: this.title,
      audience: this.audience,
      generated: new Date().toISOString(),
      summary: { ...summary },
      sections: this.sections.map(section => ({ ...section })),
    };
  }
}

module.exports = ReportBuilder;

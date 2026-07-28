const Organization = require('../../organization/Organization');

/**
 * Registers the 3 example skills onto a SkillRegistry. All three are
 * deliberately safe: no filesystem writes, no network calls, no arbitrary
 * code execution.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerExampleSkills(registry) {
  registry.register('summarize_text', {
    capability: 'text_summarization',
    description: 'Returns a word count and truncated preview of the given text (structural placeholder, no model call).',
    inputSchema: { text: { type: 'string', required: true } },
    handler: async ({ text }) => {
      const trimmed = text.trim();
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      const preview = trimmed.length > 140 ? `${trimmed.slice(0, 140)}...` : trimmed;
      return { wordCount, preview, note: 'Placeholder structural summary — no model call made.' };
    },
  });

  registry.register('format_currency', {
    capability: 'currency_formatting',
    description: 'Formats a numeric amount as a localized currency string.',
    inputSchema: { amount: { type: 'number', required: true }, currency: { type: 'string', required: false } },
    handler: async ({ amount, currency = 'USD' }) => {
      const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
      return { formatted, amount, currency };
    },
  });

  registry.register('lookup_department', {
    capability: 'org_lookup',
    description: 'Looks up a department by id in the org chart.',
    inputSchema: { departmentId: { type: 'string', required: true } },
    handler: async ({ departmentId }) => {
      const org = Organization.createDefault();
      const chart = org.getOrganizationChart();
      const dept = chart.departments.find(d => d.id === departmentId);
      if (!dept) return { found: false, departmentId };
      return { found: true, department: dept };
    },
  });
}

module.exports = { registerExampleSkills };

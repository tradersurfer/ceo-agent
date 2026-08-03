/**
 * Registers CFO Agent scaffold skills onto a SkillRegistry.
 *
 * These are structural stubs — see core/skills/ceoSkills.js for the full
 * scaffold documentation. All handlers return `{ scaffolded: true }`.
 *
 * Capabilities covered:
 *   capital_allocation, treasury_management, risk_and_controls,
 *   unit_economics, macro_market_analysis
 *
 * NOTE: digital_asset_treasury_tracking, options_chain_analysis, and
 * real_estate_cap_rate_modeling are flagged as open product-scope questions
 * in docs/BACKLOG-skill-expansion.md — they may be install-specific rather
 * than generic CFO capability. They are included here as scaffold stubs
 * with disableModelInvocation=true pending that decision.
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerCfoSkills(registry) {
  const SCAFFOLD_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  const scaffoldHandler = (skillName) => async (input) => ({
    scaffolded: true,
    skill: skillName,
    input,
    note: 'Scaffold stub — no logic implemented. See docs/BACKLOG-skill-expansion.md for implementation roadmap.',
  });

  registry.register('three_statement_modeling', {
    capability: 'capital_allocation',
    description: 'Dynamically links income, balance sheet, and cash flow statements.',
    disableModelInvocation: true,
    inputSchema: {
      incomeStatement: { type: 'object', required: true },
      balanceSheet: { type: 'object', required: true },
      cashFlow: { type: 'object', required: true },
    },
    outputSchema: {
      linkedModel: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('three_statement_modeling'),
  });

  registry.register('cash_conversion_cycle_calc', {
    capability: 'treasury_management',
    description: 'Measures and optimizes how fast capital moves through the system (DIO + DSO - DPO).',
    disableModelInvocation: true,
    inputSchema: {
      inventoryDays: { type: 'number', required: true },
      receivableDays: { type: 'number', required: true },
      payableDays: { type: 'number', required: true },
    },
    outputSchema: {
      ccc: { type: 'number', required: true },
      analysis: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('cash_conversion_cycle_calc'),
  });

  registry.register('dupont_performance_diagnosis', {
    capability: 'unit_economics',
    description: 'Breaks down Return on Equity (ROE) into actionable profit margin and asset turnover drivers.',
    disableModelInvocation: true,
    inputSchema: {
      netIncome: { type: 'number', required: true },
      revenue: { type: 'number', required: true },
      totalAssets: { type: 'number', required: true },
      equity: { type: 'number', required: true },
    },
    outputSchema: {
      roe: { type: 'number', required: true },
      breakdown: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('dupont_performance_diagnosis'),
  });

  registry.register('dcf_valuation', {
    capability: 'capital_allocation',
    description: 'Calculates Net Present Value (NPV) and Internal Rate of Return (IRR) for new projects or acquisitions.',
    disableModelInvocation: true,
    inputSchema: {
      cashFlows: { type: 'array', required: true },
      discountRate: { type: 'number', required: true },
      initialInvestment: { type: 'number', required: true },
    },
    outputSchema: {
      npv: { type: 'number', required: true },
      irr: { type: 'number', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('dcf_valuation'),
  });

  registry.register('scenario_planning_matrix', {
    capability: 'risk_and_controls',
    description: 'Runs base, upside, and downside models with explicit decision triggers before capital is deployed.',
    disableModelInvocation: true,
    inputSchema: {
      scenarios: { type: 'array', required: true },
      decisionTriggers: { type: 'array', required: false },
    },
    outputSchema: {
      matrix: { type: 'object', required: true },
      recommendation: { type: 'string', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('scenario_planning_matrix'),
  });

  registry.register('digital_asset_treasury_tracking', {
    capability: 'treasury_management',
    description: 'Monitors on-chain metrics, long-term holder data, and corporate treasury accumulation strategies. [Open product-scope question — see BACKLOG-skill-expansion.md]',
    disableModelInvocation: true,
    inputSchema: {
      assetSymbols: { type: 'array', required: true },
      metrics: { type: 'array', required: false },
    },
    outputSchema: {
      treasuryReport: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('digital_asset_treasury_tracking'),
  });

  registry.register('options_chain_analysis', {
    capability: 'macro_market_analysis',
    description: 'Tracks and evaluates short-term equity swing strategies and contract premiums. [Open product-scope question — see BACKLOG-skill-expansion.md]',
    disableModelInvocation: true,
    inputSchema: {
      ticker: { type: 'string', required: true },
      expiration: { type: 'string', required: false },
      strategy: { type: 'string', required: false },
    },
    outputSchema: {
      chainAnalysis: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('options_chain_analysis'),
  });

  registry.register('real_estate_cap_rate_modeling', {
    capability: 'capital_allocation',
    description: 'Provides execution capability for physical asset investments and property portfolio allocations. [Open product-scope question — see BACKLOG-skill-expansion.md]',
    disableModelInvocation: true,
    inputSchema: {
      propertyValue: { type: 'number', required: true },
      noi: { type: 'number', required: true },
      marketRate: { type: 'number', required: false },
    },
    outputSchema: {
      capRate: { type: 'number', required: true },
      analysis: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('real_estate_cap_rate_modeling'),
  });
}

module.exports = { registerCfoSkills };

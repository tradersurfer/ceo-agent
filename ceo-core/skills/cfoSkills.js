/**
 * Registers CFO Agent skills onto a SkillRegistry.
 *
 * Three skills are real pure-computation implementations (no external
 * dependencies, same constraint as financialModelSkill.js):
 *
 *   cash_conversion_cycle_calc  — CCC = DIO + DSO − DPO
 *   dupont_performance_diagnosis — ROE = NPM × AT × EM (3-step DuPont)
 *   dcf_valuation               — NPV + IRR from cash-flow projection
 *
 * These validate inputs strictly, compute deterministically, and surface
 * edge cases honestly (division-by-zero, no-real-IRR, negative NPV) rather
 * than silently producing NaN or a fixed placeholder.
 *
 * The remaining five are structural scaffold stubs — see the module comment
 * in core/skills/ceoSkills.js for the full scaffold documentation. Each
 * returns `{ scaffolded: true }` and is registered with
 * `disableModelInvocation: true`.
 *
 * NOTE: digital_asset_treasury_tracking, options_chain_analysis, and
 * real_estate_cap_rate_modeling are flagged as open product-scope questions
 * in docs/BACKLOG-skill-expansion.md — they may be install-specific rather
 * than generic CFO capability. They are included here as scaffold stubs
 * with disableModelInvocation=true pending that decision.
 *
 * Capabilities covered:
 *   capital_allocation, treasury_management, risk_and_controls,
 *   unit_economics, macro_market_analysis
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */

/**
 * Cash Conversion Cycle: how many days capital is tied up in the operating cycle.
 * CCC = Days Inventory Outstanding + Days Sales Outstanding − Days Payable Outstanding.
 * A lower (even negative) CCC means capital cycles faster.
 *
 * @param {number} inventoryDays DIO
 * @param {number} receivableDays DSO
 * @param {number} payableDays DPO
 * @returns {{ ccc: number, analysis: object }}
 */
function computeCashConversionCycle(inventoryDays, receivableDays, payableDays) {
  const ccc = inventoryDays + receivableDays - payableDays;
  const operatingCycle = inventoryDays + receivableDays;

  let interpretation;
  if (ccc < 0) {
    interpretation = 'Negative CCC — payables fund the operating cycle; strong working-capital position.';
  } else if (ccc <= 30) {
    interpretation = 'Short CCC — capital converts to cash quickly.';
  } else if (ccc <= 60) {
    interpretation = 'Moderate CCC — typical for many operating businesses.';
  } else {
    interpretation = 'Long CCC — significant capital is tied up in the operating cycle.';
  }

  // Dominant component (absolute contribution to operating cycle length)
  const components = [
    { name: 'inventoryDays', value: inventoryDays, label: 'Days Inventory Outstanding' },
    { name: 'receivableDays', value: receivableDays, label: 'Days Sales Outstanding' },
    { name: 'payableDays', value: payableDays, label: 'Days Payable Outstanding' },
  ];
  const dominant = components.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));

  return {
    ccc,
    analysis: {
      operatingCycle,
      components: {
        dio: inventoryDays,
        dso: receivableDays,
        dpo: payableDays,
      },
      dominantComponent: dominant.name,
      interpretation,
    },
  };
}

/**
 * Three-step DuPont decomposition of Return on Equity.
 * ROE = (Net Income / Revenue) × (Revenue / Total Assets) × (Total Assets / Equity)
 *     = Net Profit Margin × Asset Turnover × Equity Multiplier
 *
 * @param {number} netIncome
 * @param {number} revenue
 * @param {number} totalAssets
 * @param {number} equity
 * @returns {{ roe: number, breakdown: object }}
 */
function computeDupont(netIncome, revenue, totalAssets, equity) {
  if (revenue === 0) {
    throw new RangeError('revenue must be non-zero for DuPont diagnosis (division by zero).');
  }
  if (totalAssets === 0) {
    throw new RangeError('totalAssets must be non-zero for DuPont diagnosis (division by zero).');
  }
  if (equity === 0) {
    throw new RangeError('equity must be non-zero for DuPont diagnosis (division by zero).');
  }

  const netProfitMargin = netIncome / revenue;
  const assetTurnover = revenue / totalAssets;
  const equityMultiplier = totalAssets / equity;
  const roe = netProfitMargin * assetTurnover * equityMultiplier;

  // Surface which lever contributes most to the absolute ROE magnitude
  // by comparing absolute log-contributions (or absolute values when near zero).
  const drivers = [
    { name: 'netProfitMargin', value: netProfitMargin, abs: Math.abs(netProfitMargin) },
    { name: 'assetTurnover', value: assetTurnover, abs: Math.abs(assetTurnover) },
    { name: 'equityMultiplier', value: equityMultiplier, abs: Math.abs(equityMultiplier) },
  ];
  // For "which lever moves the needle most" we rank by absolute deviation from 1
  // for ratios near multiplicative identity, but simpler: largest absolute driver.
  const primaryDriver = drivers.reduce((a, b) => (b.abs > a.abs ? b : a)).name;

  return {
    roe,
    breakdown: {
      netProfitMargin,
      assetTurnover,
      equityMultiplier,
      primaryDriver,
      formula: 'ROE = (NI/Rev) × (Rev/Assets) × (Assets/Equity)',
    },
  };
}

/**
 * NPV of a project given future cash flows and an initial investment.
 * NPV = −initialInvestment + Σ CF_t / (1 + r)^t   for t = 1..n
 *
 * @param {number[]} cashFlows Future period cash flows (period 1..n)
 * @param {number} discountRate Decimal rate per period (0.10 = 10%)
 * @param {number} initialInvestment Upfront outlay (positive number treated as cost)
 * @returns {number}
 */
function computeNpv(cashFlows, discountRate, initialInvestment) {
  let npv = -initialInvestment;
  for (let t = 0; t < cashFlows.length; t++) {
    const period = t + 1;
    npv += cashFlows[t] / Math.pow(1 + discountRate, period);
  }
  return npv;
}

/**
 * IRR via bisection on the NPV function.
 * Returns null when no real root exists in a wide search band
 * (e.g. all cash flows non-positive after the initial outlay).
 *
 * @param {number[]} cashFlows
 * @param {number} initialInvestment
 * @returns {number|null} IRR as a decimal, or null if none found
 */
function computeIrr(cashFlows, initialInvestment) {
  const npvAt = (rate) => computeNpv(cashFlows, rate, initialInvestment);

  // Bracket search over a wide range; IRR can be negative.
  let lo = -0.99;
  let hi = 10;
  let npvLo = npvAt(lo);
  let npvHi = npvAt(hi);

  // Expand upper bound if needed (high-return projects)
  let expand = 0;
  while (npvLo * npvHi > 0 && expand < 8) {
    hi *= 2;
    npvHi = npvAt(hi);
    expand++;
  }

  if (npvLo * npvHi > 0) {
    // No sign change — no real root in the searchable band
    return null;
  }

  // Bisection
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAt(mid);
    if (Math.abs(npvMid) < 1e-10) return mid;
    if (npvLo * npvMid < 0) {
      hi = mid;
      npvHi = npvMid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Full DCF valuation: NPV + IRR + decision recommendation.
 *
 * @param {number[]} cashFlows
 * @param {number} discountRate
 * @param {number} initialInvestment
 * @returns {{ npv: number, irr: number|null, analysis: object }}
 */
function computeDcf(cashFlows, discountRate, initialInvestment) {
  const npv = computeNpv(cashFlows, discountRate, initialInvestment);
  const irr = computeIrr(cashFlows, initialInvestment);

  // Treat |NPV| < 1e-9 as economically zero (floating-point tolerance).
  let recommendation;
  if (Math.abs(npv) < 1e-9) {
    recommendation = 'Indifferent — NPV is zero; project earns exactly the discount rate.';
  } else if (npv > 0) {
    recommendation = 'Accept — positive NPV creates value at the given discount rate.';
  } else {
    recommendation = 'Reject — negative NPV destroys value at the given discount rate.';
  }

  return {
    npv,
    irr,
    analysis: {
      initialInvestment,
      discountRate,
      periods: cashFlows.length,
      totalUndiscountedCashFlows: cashFlows.reduce((s, c) => s + c, 0),
      recommendation,
      irrNote: irr === null
        ? 'No real IRR found in searchable band (cash-flow sign pattern may not cross zero).'
        : null,
    },
  };
}

function assertNumber(name, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

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

  // cash_conversion_cycle_calc — real implementation (Grok). Input/output
  // field names match the scaffold's declared schema exactly (confirmed
  // before reconciling): inventoryDays/receivableDays/payableDays in,
  // ccc/analysis out, both required. No schema change needed.
  registry.register('cash_conversion_cycle_calc', {
    capability: 'treasury_management',
    description: 'Measures how fast capital moves through the operating cycle (DIO + DSO − DPO).',
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
    handler: async (input) => {
      assertNumber('inventoryDays', input.inventoryDays);
      assertNumber('receivableDays', input.receivableDays);
      assertNumber('payableDays', input.payableDays);
      return computeCashConversionCycle(
        input.inventoryDays,
        input.receivableDays,
        input.payableDays,
      );
    },
  });

  // dupont_performance_diagnosis — real implementation (Grok). Input/output
  // field names match the scaffold's declared schema exactly (confirmed
  // before reconciling): netIncome/revenue/totalAssets/equity in,
  // roe/breakdown out, both required. No schema change needed.
  registry.register('dupont_performance_diagnosis', {
    capability: 'unit_economics',
    description: 'Breaks down Return on Equity into net profit margin, asset turnover, and equity multiplier drivers.',
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
    handler: async (input) => {
      assertNumber('netIncome', input.netIncome);
      assertNumber('revenue', input.revenue);
      assertNumber('totalAssets', input.totalAssets);
      assertNumber('equity', input.equity);
      return computeDupont(
        input.netIncome,
        input.revenue,
        input.totalAssets,
        input.equity,
      );
    },
  });

  // dcf_valuation — real implementation (Grok). inputSchema field names
  // match the scaffold's declared schema exactly (cashFlows/discountRate/
  // initialInvestment, same required flags). outputSchema does NOT match
  // the scaffold as-is, and was reconciled deliberately rather than kept:
  // the scaffold declared `irr` as required:true with no `analysis` field,
  // but the real handler can honestly return `irr: null` (no real root in
  // the searchable band) and always returns an `analysis` object. Adopted
  // Grok's outputSchema (irr required:false, analysis required:true) since
  // it's the one that actually matches what this handler returns.
  registry.register('dcf_valuation', {
    capability: 'capital_allocation',
    description: 'Calculates Net Present Value (NPV) and Internal Rate of Return (IRR) for a project or acquisition.',
    inputSchema: {
      cashFlows: { type: 'array', required: true },
      discountRate: { type: 'number', required: true },
      initialInvestment: { type: 'number', required: true },
    },
    outputSchema: {
      npv: { type: 'number', required: true },
      irr: { type: 'number', required: false },
      analysis: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: async (input) => {
      if (!Array.isArray(input.cashFlows) || input.cashFlows.length === 0) {
        throw new TypeError('cashFlows must be a non-empty array of numbers.');
      }
      for (let i = 0; i < input.cashFlows.length; i++) {
        assertNumber(`cashFlows[${i}]`, input.cashFlows[i]);
      }
      assertNumber('discountRate', input.discountRate);
      if (input.discountRate <= -1) {
        throw new RangeError('discountRate must be greater than -1 (would make (1+r)^t undefined or unstable).');
      }
      assertNumber('initialInvestment', input.initialInvestment);
      if (input.initialInvestment < 0) {
        throw new RangeError('initialInvestment must be non-negative (cost is expressed as a positive number).');
      }
      return computeDcf(input.cashFlows, input.discountRate, input.initialInvestment);
    },
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

module.exports = {
  registerCfoSkills,
  computeCashConversionCycle,
  computeDupont,
  computeNpv,
  computeIrr,
  computeDcf,
};

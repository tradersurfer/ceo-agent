const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const {
  registerCfoSkills,
  computeCashConversionCycle,
  computeDupont,
  computeNpv,
  computeIrr,
  computeDcf,
} = require('../core/skills/cfoSkills');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerCfoSkills(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCfo = { agentId: 'cfo_agent' };
const asClo = { agentId: 'clo_agent' };

function closeTo(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be close to ${expected} (ε=${epsilon})`,
  );
}

// ---------------------------------------------------------------------------
// Registration / permission metadata
// ---------------------------------------------------------------------------

test('cash_conversion_cycle_calc, dupont_performance_diagnosis, dcf_valuation register with schemas and permissions', () => {
  const { registry } = build();
  for (const id of ['cash_conversion_cycle_calc', 'dupont_performance_diagnosis', 'dcf_valuation']) {
    const skill = registry.get(id);
    assert.ok(skill, `${id} should be registered`);
    assert.ok(Object.keys(skill.inputSchema).length > 0, `${id} needs inputSchema`);
    assert.ok(Object.keys(skill.outputSchema).length > 0, `${id} needs outputSchema`);
    assert.equal(skill.permissions.requiresAgentAssignment, true);
    assert.equal(skill.disableModelInvocation, false, `${id} is a real skill — model invocation not disabled`);
  }
});

test('CFO Agent is assigned all three skills; CLO Agent is not', () => {
  const { organization } = build();
  const cfo = organization.findAgent('cfo_agent');
  const clo = organization.findAgent('clo_agent');
  for (const id of ['cash_conversion_cycle_calc', 'dupont_performance_diagnosis', 'dcf_valuation']) {
    assert.equal(cfo.skills.includes(id), true, `cfo_agent should own ${id}`);
    assert.equal(clo.skills.includes(id), false, `clo_agent should not own ${id}`);
  }
});

test('skills are denied for an agent not assigned them', async () => {
  const { executor } = build();
  const result = await executor.run(
    'cash_conversion_cycle_calc',
    { inventoryDays: 30, receivableDays: 20, payableDays: 15 },
    5000,
    asClo,
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'permission_denied');
});

// ---------------------------------------------------------------------------
// cash_conversion_cycle_calc — hand-calculated
// ---------------------------------------------------------------------------

// DIO=45, DSO=30, DPO=25 → CCC = 45+30-25 = 50
test('cash_conversion_cycle_calc matches hand-calculated CCC for known inputs', () => {
  const result = computeCashConversionCycle(45, 30, 25);
  assert.equal(result.ccc, 50);
  assert.equal(result.analysis.operatingCycle, 75);
  assert.equal(result.analysis.components.dio, 45);
  assert.equal(result.analysis.components.dso, 30);
  assert.equal(result.analysis.components.dpo, 25);
  assert.equal(result.analysis.dominantComponent, 'inventoryDays');
});

// Edge: negative CCC (payables exceed operating cycle) — valid and favorable
test('cash_conversion_cycle_calc handles negative CCC honestly', () => {
  // DIO=10, DSO=15, DPO=40 → CCC = 10+15-40 = -15
  const result = computeCashConversionCycle(10, 15, 40);
  assert.equal(result.ccc, -15);
  assert.ok(result.analysis.interpretation.includes('Negative CCC'));
});

test('cash_conversion_cycle_calc handler rejects non-numeric input', async () => {
  const { executor } = build();
  const result = await executor.run(
    'cash_conversion_cycle_calc',
    { inventoryDays: 'thirty', receivableDays: 20, payableDays: 15 },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'failed');
});

test('cash_conversion_cycle_calc end-to-end via SkillExecutor', async () => {
  const { executor } = build();
  const result = await executor.run(
    'cash_conversion_cycle_calc',
    { inventoryDays: 40, receivableDays: 35, payableDays: 20 },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.output.ccc, 55);
  assert.equal(result.output.analysis.operatingCycle, 75);
});

// ---------------------------------------------------------------------------
// dupont_performance_diagnosis — hand-calculated
// ---------------------------------------------------------------------------

// NI=100, Rev=1000, Assets=500, Equity=250
// NPM = 100/1000 = 0.1
// AT  = 1000/500 = 2.0
// EM  = 500/250 = 2.0
// ROE = 0.1 × 2.0 × 2.0 = 0.4
test('dupont_performance_diagnosis matches hand-calculated 3-step DuPont', () => {
  const result = computeDupont(100, 1000, 500, 250);
  closeTo(result.roe, 0.4);
  closeTo(result.breakdown.netProfitMargin, 0.1);
  closeTo(result.breakdown.assetTurnover, 2.0);
  closeTo(result.breakdown.equityMultiplier, 2.0);
  assert.equal(result.breakdown.formula, 'ROE = (NI/Rev) × (Rev/Assets) × (Assets/Equity)');
});

// Edge: zero equity must throw, not produce Infinity/NaN
test('dupont_performance_diagnosis rejects zero equity honestly', () => {
  assert.throws(
    () => computeDupont(100, 1000, 500, 0),
    (err) => err instanceof RangeError && /equity must be non-zero/.test(err.message),
  );
});

test('dupont_performance_diagnosis rejects zero revenue honestly', () => {
  assert.throws(
    () => computeDupont(100, 0, 500, 250),
    (err) => err instanceof RangeError && /revenue must be non-zero/.test(err.message),
  );
});

test('dupont_performance_diagnosis rejects zero totalAssets honestly', () => {
  assert.throws(
    () => computeDupont(100, 1000, 0, 250),
    (err) => err instanceof RangeError && /totalAssets must be non-zero/.test(err.message),
  );
});

// Negative net income → negative ROE (honest, not abs'd)
test('dupont_performance_diagnosis preserves negative ROE when net income is negative', () => {
  // NI=-50, Rev=1000, Assets=500, Equity=250
  // NPM=-0.05, AT=2, EM=2 → ROE=-0.2
  const result = computeDupont(-50, 1000, 500, 250);
  closeTo(result.roe, -0.2);
  closeTo(result.breakdown.netProfitMargin, -0.05);
});

test('dupont_performance_diagnosis end-to-end via SkillExecutor', async () => {
  const { executor } = build();
  const result = await executor.run(
    'dupont_performance_diagnosis',
    { netIncome: 200, revenue: 2000, totalAssets: 1000, equity: 400 },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'ok');
  // NPM=0.1, AT=2, EM=2.5 → ROE=0.5
  closeTo(result.output.roe, 0.5);
});

// ---------------------------------------------------------------------------
// dcf_valuation — hand-calculated
// ---------------------------------------------------------------------------

// Classic textbook example:
//   Initial investment = 1000
//   CF1=400, CF2=400, CF3=400, CF4=400
//   r = 10% = 0.10
//   NPV = -1000 + 400/1.1 + 400/1.1^2 + 400/1.1^3 + 400/1.1^4
//       = -1000 + 363.636… + 330.578… + 300.526… + 273.205…
//       = -1000 + 1267.946… = 267.946…
test('dcf_valuation NPV matches hand-calculated annuity', () => {
  const cashFlows = [400, 400, 400, 400];
  const discountRate = 0.10;
  const initialInvestment = 1000;
  const npv = computeNpv(cashFlows, discountRate, initialInvestment);

  // Hand calc: -1000 + 400/1.1 + 400/1.1² + 400/1.1³ + 400/1.1⁴
  const expected =
    -1000 +
    400 / 1.1 +
    400 / Math.pow(1.1, 2) +
    400 / Math.pow(1.1, 3) +
    400 / Math.pow(1.1, 4);
  closeTo(npv, expected, 1e-9);
  // Approximate known value (~267.95)
  closeTo(npv, 267.95, 0.01);
});

// IRR for the same project: solve 0 = -1000 + 400 Σ 1/(1+r)^t for t=1..4
// This is a 4-period annuity; IRR ≈ 21.86%
test('dcf_valuation IRR matches expected root for known cash flows', () => {
  const cashFlows = [400, 400, 400, 400];
  const irr = computeIrr(cashFlows, 1000);
  assert.ok(irr !== null, 'IRR should exist for this cash-flow pattern');
  // Verify NPV at the computed IRR is ~0
  closeTo(computeNpv(cashFlows, irr, 1000), 0, 1e-8);
  // Known approximate value
  closeTo(irr, 0.2186, 1e-3);
});

// Edge: negative NPV project
test('dcf_valuation reports negative NPV and reject recommendation', () => {
  // Invest 1000, get back 100/yr for 3 years at 10% discount → clearly negative
  const result = computeDcf([100, 100, 100], 0.10, 1000);
  assert.ok(result.npv < 0, `expected negative NPV, got ${result.npv}`);
  assert.ok(result.analysis.recommendation.startsWith('Reject'));
});

// Edge: all non-positive future CFs → no real IRR
test('dcf_valuation returns null IRR when cash flows never recover investment', () => {
  const irr = computeIrr([-50, -50, -50], 1000);
  assert.equal(irr, null);
  const result = computeDcf([-50, -50, -50], 0.10, 1000);
  assert.equal(result.irr, null);
  assert.ok(result.analysis.irrNote);
});

// Edge: zero NPV (project earns exactly the discount rate)
test('dcf_valuation identifies zero-NPV indifference case', () => {
  // Construct CFs whose NPV at 10% is exactly zero:
  // Single period: CF1 = initial * 1.10
  const result = computeDcf([1100], 0.10, 1000);
  closeTo(result.npv, 0, 1e-9);
  assert.ok(result.analysis.recommendation.startsWith('Indifferent'));
});

test('dcf_valuation handler rejects empty cashFlows', async () => {
  const { executor } = build();
  const result = await executor.run(
    'dcf_valuation',
    { cashFlows: [], discountRate: 0.1, initialInvestment: 1000 },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'failed');
});

test('dcf_valuation handler rejects discountRate <= -1', async () => {
  const { executor } = build();
  const result = await executor.run(
    'dcf_valuation',
    { cashFlows: [500], discountRate: -1, initialInvestment: 1000 },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'failed');
});

test('dcf_valuation end-to-end via SkillExecutor', async () => {
  const { executor } = build();
  const result = await executor.run(
    'dcf_valuation',
    {
      cashFlows: [400, 400, 400, 400],
      discountRate: 0.10,
      initialInvestment: 1000,
    },
    5000,
    asCfo,
  );
  assert.equal(result.status, 'ok');
  closeTo(result.output.npv, 267.95, 0.01);
  assert.ok(result.output.irr !== null);
  assert.ok(result.output.analysis.recommendation.startsWith('Accept'));
});

// ---------------------------------------------------------------------------
// Capability coverage
// ---------------------------------------------------------------------------

test('new CFO skills map to recognized capabilities', () => {
  const { registry } = build();
  assert.equal(registry.get('cash_conversion_cycle_calc').capability, 'treasury_management');
  assert.equal(registry.get('dupont_performance_diagnosis').capability, 'unit_economics');
  assert.equal(registry.get('dcf_valuation').capability, 'capital_allocation');

  const CapabilityResolver = require('../sdk/CapabilityResolver');
  const recognized = CapabilityResolver.RECOGNIZED_CAPABILITIES ||
    // Fallback if not exported as static — instantiate and inspect
    (() => {
      // RECOGNIZED_CAPABILITIES is module-level; re-require and check source
      const mod = require('fs').readFileSync(
        require('path').join(__dirname, '../sdk/CapabilityResolver.js'),
        'utf8',
      );
      return mod;
    })();

  if (Array.isArray(recognized)) {
    assert.ok(recognized.includes('treasury_management'));
    assert.ok(recognized.includes('unit_economics'));
    assert.ok(recognized.includes('capital_allocation'));
  } else {
    // String source check
    assert.ok(recognized.includes("'treasury_management'"));
    assert.ok(recognized.includes("'unit_economics'"));
    assert.ok(recognized.includes("'capital_allocation'"));
  }
});

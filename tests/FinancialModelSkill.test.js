const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const {
  registerFinancialModelSkills,
  compute,
  defaultModel,
  parseRevenueCsv,
  averageOfLastThree,
} = require('../core/skills/financialModelSkill');
const { UPLOAD_ROOT, saveUpload } = require('../lib/uploadStore');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerFinancialModelSkills(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCfo = { agentId: 'cfo_agent' };
const asClo = { agentId: 'clo_agent' };

function closeTo(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be close to ${expected}`);
}

test('compute_financial_model and import_revenue_csv register through SkillRegistry with schema and permission metadata', () => {
  const { registry } = build();
  for (const id of ['compute_financial_model', 'import_revenue_csv']) {
    const skill = registry.get(id);
    assert.ok(skill, `${id} should be registered`);
    assert.ok(Object.keys(skill.inputSchema).length > 0);
    assert.ok(Object.keys(skill.outputSchema).length > 0);
    assert.equal(skill.permissions.requiresAgentAssignment, true);
  }
});

test('CFO Agent is assigned both skills; CLO Agent is not', () => {
  const { organization } = build();
  const cfo = organization.findAgent('cfo_agent');
  const clo = organization.findAgent('clo_agent');
  assert.equal(cfo.skills.includes('compute_financial_model'), true);
  assert.equal(cfo.skills.includes('import_revenue_csv'), true);
  assert.equal(clo.skills.includes('compute_financial_model'), false);
  assert.equal(clo.skills.includes('import_revenue_csv'), false);
});

test('compute_financial_model is denied for an agent not assigned it', async () => {
  const { executor } = build();
  const result = await executor.run('compute_financial_model', { model: defaultModel() }, 5000, asClo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'permission_denied');
});

// --- Hand-calculated verification against defaultModel(), base scenario ---
//
// Month 1 (Jan 2026, i=0): base scenario multipliers are startX=1.00,
// growthX=1.00, and (1+rate)^0 == 1 for every stream regardless of growth,
// so each stream's month-1 revenue is exactly `start * startX`, except the
// seasonal stream (Holiday Pop-up Sales, seasonalMult 4.2), since January
// is a seasonal month ([1,2,3,4]):
//   E-commerce 4200, Courses 1800, Freelance 2500, Pop-up 800*4.2=3360, Affiliate 950
//   income = 4200+1800+2500+3360+950 = 12810
//   cogs   = 4200*.35 + 1800*.08 + 2500*.05 + 3360*.40 + 950*.02
//          = 1470 + 144 + 125 + 1344 + 19 = 3102
//   gross  = 12810 - 3102 = 9708
//   opex   = 320+750+400+280+175+140 = 2065
//   noi    = 9708 - 2065 = 7643
//   tax    = 7643 * 0.28 = 2140.04
//   retained = 7643 - 2140.04 - 3500(draw) = 2002.96
//   endCash  = 18500(startingCash) + 2002.96 = 20502.96
test('compute() month 1 matches hand-calculated P&L and cash for defaultModel() under base scenario', () => {
  const result = compute(defaultModel(), 'base', 12);
  const m1 = result.months[0];

  assert.equal(m1.label, 'Jan 26');
  assert.equal(m1.cal, 1);
  assert.deepEqual(m1.streamRev.map(v => Math.round(v * 100) / 100), [4200, 1800, 2500, 3360, 950]);
  closeTo(m1.income, 12810);
  closeTo(m1.cogs, 3102);
  closeTo(m1.gross, 9708);
  closeTo(m1.opex, 2065);
  closeTo(m1.noi, 7643);
  closeTo(m1.tax, 2140.04);
  closeTo(m1.draw, 3500);
  closeTo(m1.retained, 2002.96);
  closeTo(m1.beginCash, 18500);
  closeTo(m1.endCash, 20502.96);
});

// Month 2 (Feb 2026, i=1): now growth compounds one step, still a seasonal
// month for the Pop-up stream.
//   E-commerce 4200*1.06=4452, Courses 1800*1.09=1962, Freelance 2500*1.04=2600,
//   Pop-up (800*1.02)*4.2=816*4.2=3427.2, Affiliate 950*1.07=1016.5
//   income = 4452+1962+2600+3427.2+1016.5 = 13457.7
//   cogs   = 4452*.35 + 1962*.08 + 2600*.05 + 3427.2*.40 + 1016.5*.02
//          = 1558.2 + 156.96 + 130 + 1370.88 + 20.33 = 3236.37
//   gross  = 13457.7 - 3236.37 = 10221.33
//   noi    = 10221.33 - 2065 = 8156.33
//   tax    = 8156.33 * 0.28 = 2283.7724
//   retained = 8156.33 - 2283.7724 - 3500 = 2372.5576
//   beginCash = month 1's endCash = 20502.96
//   endCash   = 20502.96 + 2372.5576 = 22875.5176
test('compute() month 2 matches hand-calculated P&L and cash, cash carries forward from month 1', () => {
  const result = compute(defaultModel(), 'base', 12);
  const m2 = result.months[1];

  assert.equal(m2.label, 'Feb 26');
  closeTo(m2.streamRev[0], 4452);
  closeTo(m2.streamRev[3], 3427.2);
  closeTo(m2.income, 13457.7);
  closeTo(m2.cogs, 3236.37);
  closeTo(m2.gross, 10221.33);
  closeTo(m2.noi, 8156.33);
  closeTo(m2.tax, 2283.7724);
  closeTo(m2.retained, 2372.5576);
  closeTo(m2.beginCash, result.months[0].endCash);
  closeTo(m2.endCash, 22875.5176);
});

test('seasonal multiplier applies only in the specified months (Jan-Apr), and only to streams flagged seasonal', () => {
  const result = compute(defaultModel(), 'base', 12);
  const popupIdx = 3; // Holiday Pop-up Sales — the only seasonal stream in defaultModel()

  // Jan (cal=1) through Apr (cal=4): seasonal multiplier applied.
  for (let i = 0; i < 4; i++) {
    const m = result.months[i];
    assert.equal(m.cal, i + 1);
    const base = 800 * Math.pow(1 + (2 / 100) * 1.0, i); // Pop-up's own start/growth, base scenario
    closeTo(m.streamRev[popupIdx], base * 4.2);
  }

  // May (cal=5) through Dec: no seasonal multiplier, even though the stream is seasonal=true.
  for (let i = 4; i < 12; i++) {
    const m = result.months[i];
    assert.ok(m.cal >= 5, `expected month index ${i} to be outside Jan-Apr, got cal=${m.cal}`);
    const base = 800 * Math.pow(1 + (2 / 100) * 1.0, i);
    closeTo(m.streamRev[popupIdx], base); // no *4.2
  }

  // Non-seasonal streams (e.g. E-commerce, index 0) never get the multiplier,
  // even in a seasonal month.
  const jan = result.months[0];
  const ecommerceBase = 4200 * Math.pow(1 + (6 / 100) * 1.0, 0);
  closeTo(jan.streamRev[0], ecommerceBase);
});

test('scenario multipliers (startX, growthX) apply correctly across conservative/base/aggressive', () => {
  const model = defaultModel();

  // Month 1 (i=0): only startX matters, since the growth exponent is 0.
  const cons1 = compute(model, 'conservative', 1).months[0];
  const base1 = compute(model, 'base', 1).months[0];
  const aggr1 = compute(model, 'aggressive', 1).months[0];
  closeTo(cons1.streamRev[0], 4200 * 0.92); // 3864
  closeTo(base1.streamRev[0], 4200 * 1.00); // 4200
  closeTo(aggr1.streamRev[0], 4200 * 1.08); // 4536

  // Month 2 (i=1): startX and growthX both apply.
  const cons2 = compute(model, 'conservative', 2).months[1];
  const base2 = compute(model, 'base', 2).months[1];
  const aggr2 = compute(model, 'aggressive', 2).months[1];
  closeTo(cons2.streamRev[0], 4200 * 0.92 * (1 + (6 / 100) * 0.5)); // 3979.92
  closeTo(base2.streamRev[0], 4200 * 1.00 * (1 + (6 / 100) * 1.0)); // 4452
  closeTo(aggr2.streamRev[0], 4200 * 1.08 * (1 + (6 / 100) * 1.4)); // 4917.024
});

test('FY totals and KPIs are derived from the same months the caller can inspect', () => {
  const result = compute(defaultModel(), 'base', 3);
  const summedIncome = result.months.reduce((s, m) => s + m.income, 0);
  closeTo(result.fy.income, summedIncome);
  closeTo(result.kpis.income, summedIncome);
  closeTo(result.kpis.endCash, result.months[2].endCash);
  closeTo(result.kpis.exitRunRate, result.months[2].income * 12);
  assert.equal(result.fy.grossMargin, (result.fy.gross / result.fy.income) * 100);
});

test('lowCash finds the month with the minimum ending cash', () => {
  const result = compute(defaultModel(), 'base', 12);
  const manualMin = result.months.reduce((low, m) => (m.endCash < low.endCash ? m : low), result.months[0]);
  assert.equal(result.lowCash.ym, manualMin.ym);
  closeTo(result.lowCash.endCash, manualMin.endCash);
});

// --- Skill-level validation and end-to-end via SkillExecutor ---

test('compute_financial_model skill runs end-to-end and matches direct compute() output', async () => {
  const { executor } = build();
  const result = await executor.run('compute_financial_model', { model: defaultModel(), scenario: 'base', horizon: 3 }, 5000, asCfo);
  assert.equal(result.status, 'ok');
  const direct = compute(defaultModel(), 'base', 3);
  assert.equal(result.output.months.length, 3);
  closeTo(result.output.kpis.income, direct.kpis.income);
});

test('compute_financial_model rejects an unknown scenario', async () => {
  const { executor } = build();
  const result = await executor.run('compute_financial_model', { model: defaultModel(), scenario: 'moonshot' }, 5000, asCfo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Unknown scenario/);
});

test('compute_financial_model rejects an out-of-range horizon', async () => {
  const { executor } = build();
  const result = await executor.run('compute_financial_model', { model: defaultModel(), horizon: 0 }, 5000, asCfo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /horizon must be/);
});

test('compute_financial_model rejects a malformed model', async () => {
  const { executor } = build();
  const result = await executor.run('compute_financial_model', { model: { streams: [] } }, 5000, asCfo);
  assert.equal(result.status, 'failed');
});

// --- CSV import ---

test('parseRevenueCsv extracts the trailing numeric column and skips header/label rows', () => {
  const csv = 'Month,Revenue\nJan,1000\nFeb,1100\nMar,1250.5\n';
  assert.deepEqual(parseRevenueCsv(csv), [1000, 1100, 1250.5]);
});

test('averageOfLastThree averages exactly the last 3 values, or fewer if shorter', () => {
  assert.equal(averageOfLastThree([1000, 1100, 1250, 900, 800]), (1250 + 900 + 800) / 3);
  assert.equal(averageOfLastThree([500, 700]), (500 + 700) / 2);
  assert.equal(averageOfLastThree([]), 0);
});

function cleanupUpload(fileId) {
  fs.rmSync(path.join(UPLOAD_ROOT, fileId), { recursive: true, force: true });
}

test('import_revenue_csv skill reads an uploaded CSV through lib/uploadStore and computes the trailing-3-month average', async () => {
  const { executor } = build();
  const csv = 'Month,Revenue\nJan,1000\nFeb,1100\nMar,1250\nApr,900\nMay,1400\n';
  const metadata = saveUpload({ filename: 'revenue.csv', buffer: Buffer.from(csv) });
  try {
    const result = await executor.run('import_revenue_csv', { fileId: metadata.fileId }, 5000, asCfo);
    assert.equal(result.status, 'ok');
    assert.equal(result.output.monthsFound, 5);
    assert.deepEqual(result.output.last3Values, [1250, 900, 1400]);
    closeTo(result.output.average, (1250 + 900 + 1400) / 3);
  } finally {
    cleanupUpload(metadata.fileId);
  }
});

test('import_revenue_csv skill fails cleanly for an unknown fileId', async () => {
  const { executor } = build();
  const result = await executor.run('import_revenue_csv', { fileId: '00000000-0000-4000-8000-000000000000' }, 5000, asCfo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Unknown or unreadable upload/);
});

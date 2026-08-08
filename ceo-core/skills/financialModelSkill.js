/**
 * Financial modeling skills: multi-stream revenue projection, P&L, and
 * cash-flow derivation, plus revenue-CSV import — ported from the pure
 * compute logic of the person's own jeci-new-site project
 * (FinancialModel.tsx), which they have direct authorship/ownership of.
 * Different provenance than the Apache-2.0 ports elsewhere in this
 * project (claude-seo, awesome-llm-apps) — this is original work by the
 * same person maintaining this repo, so no external license attribution
 * applies. Noted here for traceability only (issue #29).
 *
 * Ported as-is (translated TypeScript -> plain JS, same algorithm, same
 * numeric behavior): the Stream/OpexItem/ModelMeta/Model/MonthRow/FY/KPIs
 * shapes (documented below as JSDoc typedefs), the SCENARIOS multiplier
 * table, defaultModel(), and compute().
 *
 * Deliberately NOT ported: all UI/rendering code and its dependencies
 * (React, recharts, wouter, framer-motion, lucide-react) — none of that
 * is relevant or portable to a backend skill. The "AI CFO Analysis"
 * feature (POST /api/ai-summary on jeci-new-site) is also not ported —
 * CFO Agent generates that narrative through this project's existing
 * ModelResolver/OpenRouterClient path from compute_financial_model's
 * output, the same way every other model call in this codebase works,
 * not via a skill that itself calls out to a live model.
 *
 * CSV import ("average of last 3 months") is an original reimplementation,
 * not a port — jeci-new-site's actual CSV parser lives server-side in its
 * own POST /api/upload handler, which isn't part of the file this was
 * extracted from, so there is no source to port for that step. This
 * implementation receives file content through the existing upload
 * infrastructure (lib/uploadStore.js, issue #44/PR #58) rather than a new
 * endpoint, and reimplements the "average of the last 3 numeric values"
 * behavior the original UI describes.
 */

const { readUpload } = require('../../lib/uploadStore');

const SEASONAL_MONTHS = [1, 2, 3, 4];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_HORIZON = 1;
const MAX_HORIZON = 60;

/**
 * @typedef {object} Stream
 * @property {string} name
 * @property {number} start Starting monthly revenue.
 * @property {number} growth Monthly growth rate, percent (e.g. 6 == 6%/mo).
 * @property {number} cogs COGS, percent of revenue.
 * @property {boolean} seasonal
 * @property {number} seasonalMult Multiplier applied in SEASONAL_MONTHS when seasonal is true.
 */
/** @typedef {{name: string, monthly: number}} OpexItem */
/** @typedef {{businessName: string, startMonth: string, startingCash: number}} ModelMeta */
/** @typedef {{meta: ModelMeta, streams: Stream[], opex: OpexItem[], ownerDraw: number, taxReservePct: number}} Model */
/**
 * @typedef {object} MonthRow
 * @property {string} label @property {string} ym @property {number} cal
 * @property {number[]} streamRev @property {number[]} streamCogs
 * @property {number} income @property {number} cogs @property {number} gross
 * @property {number[]} opexItems @property {number} opex
 * @property {number} noi @property {number} tax @property {number} draw @property {number} retained
 * @property {number} beginCash @property {number} endCash
 */
/**
 * @typedef {object} FY
 * @property {number} income @property {number} cogs @property {number} gross @property {number} opex
 * @property {number} noi @property {number} tax @property {number} draw @property {number} retained
 * @property {number[]} streamRev @property {number[]} streamCogs @property {number[]} opexItems
 * @property {number} grossMargin @property {number} opMargin
 */
/**
 * @typedef {object} KPIs
 * @property {number} income @property {number} gross @property {number} gm @property {number} om
 * @property {number} noi @property {number} retained @property {number} exitRunRate @property {number} endCash
 */

const SCENARIOS = Object.freeze({
  conservative: Object.freeze({ label: 'Conservative', growthX: 0.5, startX: 0.92 }),
  base: Object.freeze({ label: 'Base', growthX: 1.0, startX: 1.00 }),
  aggressive: Object.freeze({ label: 'Aggressive', growthX: 1.4, startX: 1.08 }),
});

/** @returns {Model} */
function defaultModel() {
  return {
    meta: { businessName: 'Meridian Growth Co.', startMonth: '2026-01', startingCash: 18500 },
    streams: [
      { name: 'E-commerce Store', start: 4200, growth: 6, cogs: 35, seasonal: false, seasonalMult: 1 },
      { name: 'Online Courses', start: 1800, growth: 9, cogs: 8, seasonal: false, seasonalMult: 1 },
      { name: 'Freelance Design', start: 2500, growth: 4, cogs: 5, seasonal: false, seasonalMult: 1 },
      { name: 'Holiday Pop-up Sales', start: 800, growth: 2, cogs: 40, seasonal: true, seasonalMult: 4.2 },
      { name: 'Affiliate Marketing', start: 950, growth: 7, cogs: 2, seasonal: false, seasonalMult: 1 },
    ],
    opex: [
      { name: 'Hosting & SaaS', monthly: 320 },
      { name: 'Paid advertising', monthly: 750 },
      { name: 'Contractor fees', monthly: 400 },
      { name: 'Shipping & fulfillment', monthly: 280 },
      { name: 'Accounting', monthly: 175 },
      { name: 'Utilities & misc', monthly: 140 },
    ],
    ownerDraw: 3500,
    taxReservePct: 28,
  };
}

/**
 * Projects a multi-stream revenue model into a month-by-month P&L and cash
 * flow, direct port of the original's compute().
 * @param {Model} model
 * @param {'conservative'|'base'|'aggressive'} scenario
 * @param {number} horizon Number of months to project.
 * @returns {{months: MonthRow[], fy: FY, kpis: KPIs, lowCash: MonthRow}}
 */
function compute(model, scenario, horizon) {
  const sc = SCENARIOS[scenario];
  const parts = model.meta.startMonth.split('-').map(Number);
  const syear = (parts[0] && !isNaN(parts[0])) ? parts[0] : new Date().getFullYear();
  const smonth = (parts[1] && !isNaN(parts[1])) ? parts[1] : 1;

  const months = [];
  let prevEndCash = model.meta.startingCash;

  for (let i = 0; i < horizon; i++) {
    const d = new Date(syear, smonth - 1 + i, 1);
    const cal = d.getMonth() + 1;
    const label = `${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const streamRev = model.streams.map(s => {
      let rev = s.start * sc.startX * Math.pow(1 + (s.growth / 100) * sc.growthX, i);
      if (s.seasonal && SEASONAL_MONTHS.includes(cal)) rev *= s.seasonalMult;
      return rev;
    });
    const streamCogs = model.streams.map((s, si) => streamRev[si] * (s.cogs / 100));

    const income = streamRev.reduce((a, b) => a + b, 0);
    const cogs = streamCogs.reduce((a, b) => a + b, 0);
    const gross = income - cogs;

    const opexItems = model.opex.map(o => o.monthly);
    const opex = opexItems.reduce((a, b) => a + b, 0);

    const noi = gross - opex;
    const tax = Math.max(0, noi) * (model.taxReservePct / 100);
    const draw = model.ownerDraw;
    const retained = noi - tax - draw;

    const beginCash = prevEndCash;
    const endCash = beginCash + retained;
    prevEndCash = endCash;

    months.push({ label, ym, cal, streamRev, streamCogs, income, cogs, gross, opexItems, opex, noi, tax, draw, retained, beginCash, endCash });
  }

  const sumArr = arr => {
    if (!arr.length || !arr[0] || !arr[0].length) return [];
    return arr[0].map((_, idx) => arr.reduce((s, row) => s + (row[idx] ?? 0), 0));
  };

  const fyIncome = months.reduce((s, m) => s + m.income, 0);
  const fyCogs = months.reduce((s, m) => s + m.cogs, 0);
  const fyGross = months.reduce((s, m) => s + m.gross, 0);
  const fyOpex = months.reduce((s, m) => s + m.opex, 0);
  const fyNoi = months.reduce((s, m) => s + m.noi, 0);
  const fyTax = months.reduce((s, m) => s + m.tax, 0);
  const fyDraw = months.reduce((s, m) => s + m.draw, 0);
  const fyRetained = months.reduce((s, m) => s + m.retained, 0);

  const fy = {
    income: fyIncome, cogs: fyCogs, gross: fyGross, opex: fyOpex,
    noi: fyNoi, tax: fyTax, draw: fyDraw, retained: fyRetained,
    streamRev: sumArr(months.map(m => m.streamRev)),
    streamCogs: sumArr(months.map(m => m.streamCogs)),
    opexItems: sumArr(months.map(m => m.opexItems)),
    grossMargin: fyIncome > 0 ? (fyGross / fyIncome) * 100 : 0,
    opMargin: fyIncome > 0 ? (fyNoi / fyIncome) * 100 : 0,
  };

  const lastMonth = months[months.length - 1] ?? months[0];
  const kpis = {
    income: fyIncome, gross: fyGross, gm: fy.grossMargin, om: fy.opMargin,
    noi: fyNoi, retained: fyRetained,
    exitRunRate: lastMonth ? lastMonth.income * 12 : 0,
    endCash: lastMonth ? lastMonth.endCash : 0,
  };

  const emptyRow = {
    label: '—', ym: '', cal: 1, streamRev: [], streamCogs: [], income: 0, cogs: 0,
    gross: 0, opexItems: [], opex: 0, noi: 0, tax: 0, draw: 0, retained: 0, beginCash: 0, endCash: 0,
  };
  const lowCash = months.length
    ? months.reduce((low, m) => (m.endCash < low.endCash ? m : low), months[0])
    : emptyRow;

  return { months, fy, kpis, lowCash };
}

/**
 * Extracts numeric revenue values from CSV text — the trailing column of
 * each row that parses as a finite number, skipping header/label rows.
 * @param {string} text
 * @returns {number[]}
 */
function parseRevenueCsv(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const values = [];
  for (const line of lines) {
    const cells = line.split(',').map(c => c.trim());
    const num = parseFloat(cells[cells.length - 1]);
    if (Number.isFinite(num)) values.push(num);
  }
  return values;
}

/**
 * Averages the last 3 values in a series (or fewer, if the series is
 * shorter), same "average of the last 3 months" behavior as the original.
 * @param {number[]} values
 * @returns {number}
 */
function averageOfLastThree(values) {
  const last3 = values.slice(-3);
  if (last3.length === 0) return 0;
  return last3.reduce((s, v) => s + v, 0) / last3.length;
}

function validateModel(model) {
  if (!model || typeof model !== 'object') throw new TypeError('model is required.');
  if (!model.meta || typeof model.meta !== 'object') throw new TypeError('model.meta is required.');
  if (typeof model.meta.startMonth !== 'string' || !/^\d{4}-\d{2}$/.test(model.meta.startMonth)) {
    throw new TypeError('model.meta.startMonth must be a "YYYY-MM" string.');
  }
  if (typeof model.meta.startingCash !== 'number') throw new TypeError('model.meta.startingCash must be a number.');
  if (!Array.isArray(model.streams) || model.streams.length === 0) {
    throw new TypeError('model.streams must be a non-empty array.');
  }
  for (const s of model.streams) {
    if (!s || typeof s.name !== 'string' || typeof s.start !== 'number' || typeof s.growth !== 'number' || typeof s.cogs !== 'number') {
      throw new TypeError('Each stream requires name (string), start/growth/cogs (numbers).');
    }
  }
  if (!Array.isArray(model.opex)) throw new TypeError('model.opex must be an array.');
  for (const o of model.opex) {
    if (!o || typeof o.name !== 'string' || typeof o.monthly !== 'number') {
      throw new TypeError('Each opex item requires name (string) and monthly (number).');
    }
  }
  if (typeof model.ownerDraw !== 'number') throw new TypeError('model.ownerDraw must be a number.');
  if (typeof model.taxReservePct !== 'number') throw new TypeError('model.taxReservePct must be a number.');
}

/**
 * Registers the financial-modeling skills onto a SkillRegistry.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerFinancialModelSkills(registry) {
  registry.register('compute_financial_model', {
    capability: 'financial_projection',
    description: 'Projects a multi-stream revenue model into a month-by-month P&L and cash flow.',
    inputSchema: {
      model: { type: 'object', required: true },
      scenario: { type: 'string', required: false },
      horizon: { type: 'number', required: false },
    },
    outputSchema: {
      months: { type: 'array', required: true },
      fy: { type: 'object', required: true },
      kpis: { type: 'object', required: true },
      lowCash: { type: 'object', required: true },
    },
    permissions: { requiresAgentAssignment: true },
    handler: async ({ model, scenario = 'base', horizon = 12 }) => {
      if (!SCENARIOS[scenario]) {
        throw new RangeError(`Unknown scenario "${scenario}". Expected one of: ${Object.keys(SCENARIOS).join(', ')}.`);
      }
      if (!Number.isInteger(horizon) || horizon < MIN_HORIZON || horizon > MAX_HORIZON) {
        throw new RangeError(`horizon must be an integer between ${MIN_HORIZON} and ${MAX_HORIZON}.`);
      }
      validateModel(model);
      return compute(model, scenario, horizon);
    },
  });

  registry.register('import_revenue_csv', {
    capability: 'financial_csv_import',
    description: 'Reads an uploaded revenue CSV and averages the last 3 months of values.',
    inputSchema: {
      fileId: { type: 'string', required: true },
    },
    outputSchema: {
      monthsFound: { type: 'number', required: true },
      last3Values: { type: 'array', required: true },
      average: { type: 'number', required: true },
    },
    permissions: { requiresAgentAssignment: true },
    handler: async ({ fileId }) => {
      const buffer = readUpload(fileId);
      if (!buffer) throw new Error(`Unknown or unreadable upload: ${fileId}`);
      const values = parseRevenueCsv(buffer.toString('utf8'));
      return { monthsFound: values.length, last3Values: values.slice(-3), average: averageOfLastThree(values) };
    },
  });
}

module.exports = {
  registerFinancialModelSkills,
  compute,
  defaultModel,
  parseRevenueCsv,
  averageOfLastThree,
  SCENARIOS,
  SEASONAL_MONTHS,
};

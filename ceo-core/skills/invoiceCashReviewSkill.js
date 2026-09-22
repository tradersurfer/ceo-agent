/**
 * invoice_cash_review — CFO skill.
 *
 * Deterministic pipeline only:
 *   pasted CSV / JSON / invoice array  OR  uploaded file via lib/uploadStore
 *     → current / 1-30 / 31-60 / 61-90 / 90+ aging
 *     → top 5 overdue follow-up drafts (APPROVAL_REQUIRED, never sent)
 *     → base-case 90-day cash-inflow sketch from the same invoices
 *     → audit row via SkillExecutor (no extra memory bus)
 *
 * Does not call compute_financial_model, does not invent missing amounts
 * or dates, does not send email.
 */

const { readUpload } = require('../../lib/uploadStore');

const BUCKETS = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_90_plus'];

const HEADER_ALIASES = {
  id: ['id', 'invoice_id', 'invoice', 'invoiceid', 'number', 'inv'],
  customer: ['customer', 'client', 'name', 'counterparty', 'vendor', 'company'],
  amount: ['amount', 'total', 'balance', 'due', 'amt'],
  dueDate: ['duedate', 'due_date', 'due', 'datedue'],
  issueDate: ['issuedate', 'issue_date', 'date', 'invoicedate', 'invoice_date'],
};

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function startOfUtcDay(value) {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function overdueDays(dueDate, referenceDate) {
  const due = startOfUtcDay(dueDate);
  const ref = startOfUtcDay(referenceDate);
  if (due == null || ref == null) return null;
  return Math.floor((ref - due) / 86400000);
}

function emptyBucket() {
  return { count: 0, total: 0, items: [] };
}

function pickAlias(row, aliases) {
  for (const key of Object.keys(row)) {
    const norm = String(key).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (aliases.includes(norm)) return row[key];
  }
  return '';
}

function normalizeRecord(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError(`Invoice at index ${index} is not an object.`);
  }
  const id = String(pickAlias(raw, HEADER_ALIASES.id) || raw.id || '').trim();
  const customer = String(pickAlias(raw, HEADER_ALIASES.customer) || raw.customer || '').trim();
  const amountRaw = pickAlias(raw, HEADER_ALIASES.amount);
  const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw).replace(/[$,]/g, ''));
  const dueDate = String(pickAlias(raw, HEADER_ALIASES.dueDate) || raw.dueDate || '').trim();
  const issueDate = String(pickAlias(raw, HEADER_ALIASES.issueDate) || raw.issueDate || '').trim();

  if (!id) throw new TypeError(`Invoice at index ${index} is missing id.`);
  if (!Number.isFinite(amount)) {
    throw new TypeError(`Invoice ${id || index} is missing a numeric amount; refusing to invent one.`);
  }
  if (!dueDate || startOfUtcDay(dueDate) == null) {
    throw new TypeError(`Invoice ${id} is missing a parseable dueDate; refusing to invent one.`);
  }

  return {
    id,
    customer: customer || 'Unknown',
    amount: money(amount),
    dueDate,
    issueDate,
  };
}

function parseObjectRecords(value) {
  if (Array.isArray(value)) return value.map((row, i) => normalizeRecord(row, i));
  if (value && typeof value === 'object' && Array.isArray(value.invoices)) {
    return value.invoices.map((row, i) => normalizeRecord(row, i));
  }
  throw new TypeError('Invoice input must be a CSV string, a JSON array, or { invoices: [] }.');
}

function parseCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const looksLikeHeader = headers.some((h) => {
    const n = h.toLowerCase().replace(/[\s-]+/g, '_');
    return Object.values(HEADER_ALIASES).some((aliases) => aliases.includes(n));
  });
  if (!looksLikeHeader) {
    throw new TypeError('CSV is missing a recognizable header row (need id, customer, amount, dueDate).');
  }
  return lines.slice(1).map((line, i) => {
    const parts = line.split(delimiter).map((p) => p.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] == null ? '' : parts[idx];
    });
    return normalizeRecord(row, i);
  });
}

function parseInvoiceInput(rawInput) {
  if (rawInput == null || rawInput === '') return [];
  if (Array.isArray(rawInput) || (rawInput && typeof rawInput === 'object' && !Buffer.isBuffer(rawInput))) {
    return parseObjectRecords(rawInput);
  }
  const text = Buffer.isBuffer(rawInput) ? rawInput.toString('utf8') : String(rawInput);
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new TypeError('Invoice text looked like JSON but did not parse.');
    }
    return parseObjectRecords(parsed);
  }
  return parseCsv(trimmed);
}

function bucketKey(days) {
  if (days <= 0) return 'current';
  if (days <= 30) return 'days_1_30';
  if (days <= 60) return 'days_31_60';
  if (days <= 90) return 'days_61_90';
  return 'days_90_plus';
}

function calculateAgingBuckets(invoices, referenceDate = new Date()) {
  const buckets = Object.fromEntries(BUCKETS.map((k) => [k, emptyBucket()]));
  for (const inv of invoices) {
    const days = overdueDays(inv.dueDate, referenceDate);
    if (days == null) {
      throw new TypeError(`Invoice ${inv.id} has an unparseable dueDate.`);
    }
    const key = bucketKey(days);
    const item = { ...inv, overdueDays: Math.max(0, days) };
    buckets[key].count += 1;
    buckets[key].total = money(buckets[key].total + inv.amount);
    buckets[key].items.push(item);
  }
  return buckets;
}

function generateTopFollowUpDrafts(invoices, referenceDate = new Date()) {
  return invoices
    .map((inv) => ({
      ...inv,
      overdueDays: overdueDays(inv.dueDate, referenceDate),
    }))
    .filter((inv) => inv.overdueDays != null && inv.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays || b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((inv) => ({
      invoiceId: inv.id,
      customer: inv.customer,
      amount: inv.amount,
      overdueDays: inv.overdueDays,
      dueDate: inv.dueDate,
      status: 'APPROVAL_REQUIRED',
      send: false,
      subjectDraft: `Follow-up: Invoice ${inv.id} ($${inv.amount.toFixed(2)}) is ${inv.overdueDays} days past due`,
      bodyDraft: [
        `Hello ${inv.customer}`,
        '',
        `Our records show Invoice ${inv.id} for $${inv.amount.toFixed(2)} was due on ${inv.dueDate} and is ${inv.overdueDays} days past due.`,
        'Please confirm receipt and the expected settlement date.',
        '',
        'This draft has not been sent. Owner approval is required.',
        '',
        'Thank you,',
        'Finance Department',
      ].join('\n'),
    }));
}

function calculateBaseCaseCashSketch(invoices, referenceDate = new Date()) {
  const sketch = {
    day_30_inflow: 0,
    day_60_inflow: 0,
    day_90_inflow: 0,
    uncollectible_reserve: 0,
    rule: {
      current: 'counted in day_30_inflow',
      days_1_30: 'counted in day_60_inflow',
      days_31_60: 'counted in day_90_inflow',
      days_61_plus: 'counted in uncollectible_reserve (no invented recovery rate)',
    },
  };
  for (const inv of invoices) {
    const days = overdueDays(inv.dueDate, referenceDate);
    if (days == null) {
      throw new TypeError(`Invoice ${inv.id} has an unparseable dueDate.`);
    }
    if (days <= 0) sketch.day_30_inflow += inv.amount;
    else if (days <= 30) sketch.day_60_inflow += inv.amount;
    else if (days <= 60) sketch.day_90_inflow += inv.amount;
    else sketch.uncollectible_reserve += inv.amount;
  }
  sketch.day_30_inflow = money(sketch.day_30_inflow);
  sketch.day_60_inflow = money(sketch.day_60_inflow);
  sketch.day_90_inflow = money(sketch.day_90_inflow);
  sketch.uncollectible_reserve = money(sketch.uncollectible_reserve);
  return sketch;
}

function resolveRawInput({ invoices, input, fileId }) {
  if (fileId) {
    const buffer = readUpload(fileId);
    if (!buffer) throw new Error(`Unknown or unreadable upload: ${fileId}`);
    return buffer.toString('utf8');
  }
  if (invoices != null) return invoices;
  if (input != null) return input;
  throw new TypeError('Provide invoices, input (CSV/JSON text), or fileId.');
}

function runInvoiceCashReview({ invoices, input, fileId, referenceDate } = {}) {
  const ref = referenceDate || new Date().toISOString();
  const parsed = parseInvoiceInput(resolveRawInput({ invoices, input, fileId }));
  const aging = calculateAgingBuckets(parsed, ref);
  const drafts = generateTopFollowUpDrafts(parsed, ref);
  const baseCaseCashSketch = calculateBaseCaseCashSketch(parsed, ref);
  const totalReceivables = money(parsed.reduce((sum, inv) => sum + inv.amount, 0));

  return {
    skill: 'invoice_cash_review',
    department: 'finance',
    referenceDate: ref,
    totalInvoices: parsed.length,
    totalReceivables,
    aging,
    topFollowUpDrafts: drafts,
    baseCaseCashSketch,
    approvalRequired: true,
    outboundEmail: false,
  };
}

function registerInvoiceCashReviewSkill(registry) {
  registry.register('invoice_cash_review', {
    capability: 'treasury_management',
    description: 'Ages pasted or uploaded invoices, drafts top-five approval-required follow-ups, and sketches base-case 90-day cash inflow. Never sends email.',
    inputSchema: {
      input: { type: 'string', required: false },
      invoices: { type: 'array', required: false },
      fileId: { type: 'string', required: false },
      referenceDate: { type: 'string', required: false },
    },
    outputSchema: {
      skill: { type: 'string', required: true },
      aging: { type: 'object', required: true },
      topFollowUpDrafts: { type: 'array', required: true },
      baseCaseCashSketch: { type: 'object', required: true },
      approvalRequired: { type: 'boolean', required: true },
      outboundEmail: { type: 'boolean', required: true },
    },
    permissions: { requiresAgentAssignment: true },
    handler: async (params) => runInvoiceCashReview(params || {}),
  });
}

module.exports = {
  registerInvoiceCashReviewSkill,
  parseInvoiceInput,
  calculateAgingBuckets,
  generateTopFollowUpDrafts,
  calculateBaseCaseCashSketch,
  runInvoiceCashReview,
};

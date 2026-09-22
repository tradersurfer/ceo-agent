const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const {
  registerInvoiceCashReviewSkill,
  parseInvoiceInput,
  calculateAgingBuckets,
  generateTopFollowUpDrafts,
  calculateBaseCaseCashSketch,
} = require('../ceo-core/skills/invoiceCashReviewSkill');
const { UPLOAD_ROOT, saveUpload } = require('../lib/uploadStore');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerInvoiceCashReviewSkill(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: (agentId) => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCfo = { agentId: 'cfo_agent' };
const asClo = { agentId: 'clo_agent' };
const REF = '2026-09-21T00:00:00Z';

const CSV = `id,customer,amount,dueDate,issueDate
INV-001,Acme Corp,1000.00,2026-09-01,2026-08-01
INV-002,Beta LLC,2500.00,2026-08-15,2026-07-15
INV-003,Gamma Inc,500.00,2026-07-01,2026-06-01
INV-004,Delta Co,3000.00,2026-05-01,2026-04-01
INV-005,Epsilon Ltd,150.00,2026-09-25,2026-08-25
INV-006,Zeta Partners,4000.00,2026-06-15,2026-05-15`;

test('invoice_cash_review registers with schema and assignment gate', () => {
  const { registry } = build();
  const skill = registry.get('invoice_cash_review');
  assert.ok(skill);
  assert.equal(skill.permissions.requiresAgentAssignment, true);
  assert.ok(skill.inputSchema);
  assert.ok(skill.outputSchema);
});

test('CFO is assigned invoice_cash_review; CLO is not', () => {
  const { organization } = build();
  assert.equal(organization.findAgent('cfo_agent').skills.includes('invoice_cash_review'), true);
  assert.equal(organization.findAgent('clo_agent').skills.includes('invoice_cash_review'), false);
});

test('non-CFO is permission_denied', async () => {
  const { executor } = build();
  const result = await executor.run('invoice_cash_review', { input: CSV, referenceDate: REF }, 5000, asClo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'permission_denied');
});

test('parses CSV without inventing fields', () => {
  const parsed = parseInvoiceInput(CSV);
  assert.equal(parsed.length, 6);
  assert.equal(parsed[0].id, 'INV-001');
  assert.equal(parsed[0].amount, 1000);
});

test('refuses rows that omit amount or dueDate', () => {
  assert.throws(() => parseInvoiceInput('id,customer,amount,dueDate\nX,Acme,,2026-09-01\n'), /amount/);
  assert.throws(() => parseInvoiceInput('id,customer,amount,dueDate\nX,Acme,10,\n'), /dueDate/);
});

test('aging buckets match hand-dated fixtures at 2026-09-21', () => {
  const aging = calculateAgingBuckets(parseInvoiceInput(CSV), REF);
  assert.equal(aging.current.count, 1);
  assert.equal(aging.current.items[0].id, 'INV-005');
  assert.equal(aging.days_1_30.count, 1);
  assert.equal(aging.days_1_30.items[0].id, 'INV-001');
  assert.equal(aging.days_31_60.count, 1);
  assert.equal(aging.days_31_60.items[0].id, 'INV-002');
  assert.equal(aging.days_61_90.count, 1);
  assert.equal(aging.days_61_90.items[0].id, 'INV-003');
  assert.equal(aging.days_90_plus.count, 2);
  assert.deepEqual(aging.days_90_plus.items.map((i) => i.id).sort(), ['INV-004', 'INV-006']);
});

test('top five drafts are overdue-first and approval-required', () => {
  const drafts = generateTopFollowUpDrafts(parseInvoiceInput(CSV), REF);
  assert.equal(drafts.length, 5);
  assert.equal(drafts[0].invoiceId, 'INV-004');
  assert.ok(drafts.every((d) => d.status === 'APPROVAL_REQUIRED' && d.send === false));
});

test('base-case cash sketch does not invent recovery rates', () => {
  const sketch = calculateBaseCaseCashSketch(parseInvoiceInput(CSV), REF);
  assert.equal(sketch.day_30_inflow, 150);
  assert.equal(sketch.day_60_inflow, 1000);
  assert.equal(sketch.day_90_inflow, 2500);
  assert.equal(sketch.uncollectible_reserve, 7500);
});

test('SkillExecutor run never claims email sent', async () => {
  const { executor } = build();
  const result = await executor.run('invoice_cash_review', { input: CSV, referenceDate: REF }, 5000, asCfo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.skill, 'invoice_cash_review');
  assert.equal(result.output.totalInvoices, 6);
  assert.equal(result.output.outboundEmail, false);
  assert.equal(result.output.approvalRequired, true);
});

function cleanup(fileId) {
  fs.rmSync(path.join(UPLOAD_ROOT, fileId), { recursive: true, force: true });
}

test('fileId path reads lib/uploadStore', async () => {
  const { executor } = build();
  const metadata = saveUpload({ filename: 'invoices.csv', buffer: Buffer.from(CSV) });
  try {
    const result = await executor.run('invoice_cash_review', { fileId: metadata.fileId, referenceDate: REF }, 5000, asCfo);
    assert.equal(result.status, 'ok');
    assert.equal(result.output.totalInvoices, 6);
  } finally {
    cleanup(metadata.fileId);
  }
});

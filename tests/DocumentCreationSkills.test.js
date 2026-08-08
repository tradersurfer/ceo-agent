const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PDFDocument } = require('pdf-lib');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerDocumentCreationSkills } = require('../ceo-core/skills/documentCreationSkills');
const { UPLOAD_ROOT, readUpload } = require('../lib/uploadStore');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerDocumentCreationSkills(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCmo = { agentId: 'cmo_agent' };
const asClo = { agentId: 'clo_agent' };

function cleanup(fileId) {
  fs.rmSync(path.join(UPLOAD_ROOT, fileId), { recursive: true, force: true });
}

for (const [id, capability] of [
  ['generate_docx', 'document_generation_docx'],
  ['generate_pdf', 'document_generation_pdf'],
  ['generate_spreadsheet', 'document_generation_spreadsheet'],
]) {
  test(`${id} registers through SkillRegistry with schema and permission metadata`, () => {
    const { registry } = build();
    const skill = registry.get(id);
    assert.ok(skill);
    assert.equal(skill.capability, capability);
    assert.ok(Object.keys(skill.inputSchema).length > 0);
    assert.ok(Object.keys(skill.outputSchema).length > 0);
    assert.equal(skill.permissions.requiresAgentAssignment, true);
  });

  test(`CMO Agent is assigned ${id}; CLO Agent is not`, () => {
    const { organization } = build();
    assert.equal(organization.findAgent('cmo_agent').skills.includes(id), true);
    assert.equal(organization.findAgent('clo_agent').skills.includes(id), false);
  });

  test(`${id} is denied for an agent not assigned it`, async () => {
    const { executor } = build();
    const input = id === 'generate_spreadsheet'
      ? { title: 'X', rows: [['a']] }
      : { title: 'X', content: 'Body.' };
    const result = await executor.run(id, input, 5000, asClo);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'permission_denied');
  });
}

test('generate_docx produces a real, valid DOCX (OOXML zip) readable by Word', async () => {
  const { executor } = build();
  const result = await executor.run('generate_docx', {
    title: 'Q3 Marketing Brief',
    content: 'First paragraph of the brief.\n\nSecond paragraph with more detail.',
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { fileId, filename, size, mimeType } = result.output;
  try {
    assert.equal(filename, 'q3-marketing-brief.docx');
    assert.equal(mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const buffer = readUpload(fileId);
    assert.ok(buffer);
    assert.equal(buffer.length, size);
    assert.equal(buffer.slice(0, 4).toString('hex'), '504b0304', 'not a valid zip/OOXML file');
    assert.ok(buffer.includes('word/document.xml'), 'missing the DOCX document part');
    assert.ok(buffer.includes('[Content_Types].xml'), 'missing the OOXML content-types manifest');
  } finally {
    cleanup(fileId);
  }
});

test('generate_pdf produces a real, valid PDF that pdf-lib can load back', async () => {
  const { executor } = build();
  const longParagraph = 'word '.repeat(1200).trim(); // forces line wrapping and a page break
  const result = await executor.run('generate_pdf', {
    title: 'Annual Report',
    content: `Intro paragraph.\n\n${longParagraph}`,
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { fileId, filename, mimeType } = result.output;
  try {
    assert.equal(filename, 'annual-report.pdf');
    assert.equal(mimeType, 'application/pdf');

    const buffer = readUpload(fileId);
    assert.equal(buffer.slice(0, 5).toString('ascii'), '%PDF-');

    const loaded = await PDFDocument.load(buffer);
    assert.ok(loaded.getPageCount() >= 2, 'expected the long paragraph to overflow onto a second page');
  } finally {
    cleanup(fileId);
  }
});

test('generate_spreadsheet produces a real, valid XLSX that ExcelJS can read back with matching data', async () => {
  const { executor } = build();
  const result = await executor.run('generate_spreadsheet', {
    title: 'Pipeline',
    headers: ['Account', 'Stage', 'Value'],
    rows: [
      ['Acme Co', 'Negotiation', 12000],
      ['Globex', 'Discovery', 4000],
    ],
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { fileId, filename, mimeType } = result.output;
  try {
    assert.equal(filename, 'pipeline.xlsx');
    assert.equal(mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buffer = readUpload(fileId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Pipeline');
    assert.ok(sheet);
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['Account', 'Stage', 'Value']);
    assert.deepEqual(sheet.getRow(2).values.slice(1), ['Acme Co', 'Negotiation', 12000]);
    assert.deepEqual(sheet.getRow(3).values.slice(1), ['Globex', 'Discovery', 4000]);
  } finally {
    cleanup(fileId);
  }
});

test('generate_spreadsheet rejects rows that are not arrays', async () => {
  const { executor } = build();
  const result = await executor.run('generate_spreadsheet', {
    title: 'Bad',
    rows: ['not-an-array'],
  }, 5000, asCmo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'handler_error');
});

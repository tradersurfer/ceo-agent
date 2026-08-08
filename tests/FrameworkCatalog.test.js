// tests/FrameworkCatalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DOMAINS,
  frameworks,
  getAllFrameworks,
  getFrameworksByDomain,
  getFrameworkById,
} = require('../ceo-core/frameworks/catalog');
const { loadFrameworkContent, searchCatalogIndex } = require('../ceo-core/frameworks/FrameworkReader');
const { createRuntime } = require('../ceo-core/runtimeFactory');

test('catalog frameworks are structurally valid and match the declared domain list', () => {
  assert.ok(frameworks.length > 0);
  assert.equal(new Set(frameworks.map(framework => framework.id)).size, frameworks.length);
  assert.ok(DOMAINS.length > 0);
  assert.equal(new Set(DOMAINS).size, DOMAINS.length);
  assert.deepEqual(
    [...new Set(frameworks.map(framework => framework.domain))].sort(),
    [...DOMAINS].sort(),
  );
  for (const framework of frameworks) {
    assert.deepEqual(
      Object.keys(framework).sort(),
      ['definition', 'domain', 'expectedOutput', 'filePath', 'id', 'name', 'summary', 'whenToUse'].sort(),
    );
    assert.ok(framework.definition);
    assert.ok(framework.whenToUse);
    assert.ok(framework.expectedOutput);
    assert.ok(framework.filePath);
    assert.ok(framework.filePath.endsWith('.md'));
  }
});

test('catalog helpers return the canonical read-only framework data', () => {
  assert.strictEqual(getAllFrameworks(), frameworks);
  assert.equal(getFrameworksByDomain('finance').length, 5);
  assert.equal(getFrameworksByDomain(' FINANCE ').length, 5);
  assert.equal(getFrameworksByDomain('technology').length, 10);
  assert.equal(getFrameworksByDomain('people').length, 11);
  assert.equal(getFrameworksByDomain(' PEOPLE ').length, 11);
  assert.equal(getFrameworkById('scarf_model').domain, 'people');
  assert.equal(getFrameworkById('galbraiths_star_model').name, "Galbraith's Star Model");
  assert.equal(getFrameworksByDomain('legal').length, 6);
  assert.equal(getFrameworksByDomain(' LEGAL ').length, 6);
  assert.equal(getFrameworkById('irac_legal_analysis').domain, 'legal');
  assert.equal(getFrameworkById('regulatory_compliance_mapping').name, 'Regulatory Compliance Mapping');
  assert.equal(getFrameworkById('architecture_decision_records').domain, 'technology');
  assert.equal(getFrameworkById('threat_modeling').expectedOutput, 'Identified threat categories with mitigations.');
  assert.equal(getFrameworkById('mece_principle').name, 'MECE Principle');
  assert.equal(getFrameworkById('missing'), null);
  assert.equal(Object.isFrozen(frameworks), true);
  assert.equal(Object.isFrozen(frameworks[0]), true);
});

test('FrameworkReader loads Markdown content on demand from disk', async () => {
  const mece = await loadFrameworkContent('mece_principle');
  assert.ok(mece.instructions.includes('# MECE Principle Framework'));
  assert.equal(mece.domain, 'strategy');

  const porters = await loadFrameworkContent('porters_five_forces');
  assert.ok(porters.instructions.includes("# Porter's Five Forces Framework"));
});

test('runtimeFactory exposes the shared framework catalog as reference data', () => {
  const runtime = createRuntime({
    activeDepartments: ['executive'],
    customAgents: [],
  });
  assert.strictEqual(runtime.frameworkCatalog.getAllFrameworks(), frameworks);
  assert.equal(runtime.frameworkCatalog.getFrameworkById('bezos_type_1_type_2_decisions').domain, 'organization');
});
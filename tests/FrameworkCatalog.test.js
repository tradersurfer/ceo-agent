const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DOMAINS,
  frameworks,
  getAllFrameworks,
  getFrameworksByDomain,
  getFrameworkById,
} = require('../core/frameworks/catalog');
const { createRuntime } = require('../core/runtimeFactory');

test('catalog contains exactly the 34 requested frameworks across six domains', () => {
  assert.equal(frameworks.length, 34);
  assert.equal(new Set(frameworks.map(framework => framework.id)).size, 34);
  assert.deepEqual(
    [...new Set(frameworks.map(framework => framework.domain))].sort(),
    [...DOMAINS].sort(),
  );
  for (const framework of frameworks) {
    assert.deepEqual(
      Object.keys(framework).sort(),
      ['definition', 'domain', 'expectedOutput', 'id', 'name', 'whenToUse'].sort(),
    );
    assert.ok(framework.definition);
    assert.ok(framework.whenToUse);
    assert.ok(framework.expectedOutput);
  }
});

test('catalog helpers return the canonical read-only framework data', () => {
  assert.strictEqual(getAllFrameworks(), frameworks);
  assert.equal(getFrameworksByDomain('finance').length, 5);
  assert.equal(getFrameworksByDomain(' FINANCE ').length, 5);
  assert.equal(getFrameworkById('mece_principle').name, 'MECE Principle');
  assert.equal(getFrameworkById('missing'), null);
  assert.equal(Object.isFrozen(frameworks), true);
  assert.equal(Object.isFrozen(frameworks[0]), true);
});

test('runtimeFactory exposes the shared framework catalog as reference data', () => {
  const runtime = createRuntime({
    activeDepartments: ['executive'],
    customAgents: [],
  });
  assert.strictEqual(runtime.frameworkCatalog.getAllFrameworks(), frameworks);
  assert.equal(runtime.frameworkCatalog.getFrameworkById('bezos_type_1_type_2_decisions').domain, 'organization');
});

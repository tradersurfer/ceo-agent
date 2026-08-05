const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEPARTMENTS,
  capabilities,
  getAllCapabilities,
  getCapabilitiesByDepartment,
  getCapabilityById,
} = require('../core/capabilities/catalog');
const Organization = require('../organization/Organization');

test('catalog capabilities are structurally valid and match the declared department list', () => {
  assert.ok(capabilities.length > 0);
  assert.equal(new Set(capabilities.map(capability => capability.id)).size, capabilities.length);
  assert.ok(DEPARTMENTS.length > 0);
  assert.equal(new Set(DEPARTMENTS).size, DEPARTMENTS.length);
  assert.deepEqual(
    [...new Set(capabilities.map(capability => capability.department))].sort(),
    [...DEPARTMENTS].sort(),
  );
  for (const capability of capabilities) {
    assert.deepEqual(
      Object.keys(capability).sort(),
      ['department', 'description', 'id', 'name'].sort(),
    );
    assert.ok(capability.name);
    assert.ok(capability.description);
  }
});

test('catalog helpers return the canonical read-only capability data', () => {
  assert.strictEqual(getAllCapabilities(), capabilities);
  assert.equal(getCapabilityById('missing'), null);
  assert.equal(getCapabilityById('financial_strategy').department, 'finance');
  assert.equal(getCapabilityById('mece_principle'), null);
  assert.ok(getCapabilitiesByDepartment('marketing').length > 0);
  assert.ok(getCapabilitiesByDepartment(' MARKETING ').length === getCapabilitiesByDepartment('marketing').length);
  assert.equal(Object.isFrozen(capabilities), true);
  assert.equal(Object.isFrozen(capabilities[0]), true);
});

// This is the assertion that keeps the catalog from becoming a fifth
// independently-drifting source of capability truth (see docs/design/
// registry-architecture.md) — the catalog's id set must exactly equal the
// real capability set every agent actually declares.
test('catalog capability ids match the real capability set from Organization.createDefault() exactly', () => {
  const realCapabilities = new Set(Organization.createDefault().listAgents().flatMap(agent => agent.capabilities));
  const catalogIds = new Set(capabilities.map(capability => capability.id));
  assert.deepEqual(
    [...catalogIds].sort(),
    [...realCapabilities].sort(),
    'core/capabilities/catalog.js must have exactly one entry per real agent capability — no missing, no extra',
  );
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime: createCliRuntime } = require('../bin/chat');
const { createRuntime: createWebRuntime } = require('../lib/ceoAgentServer');

test('CLI and web paths build identical runtime state from the same config', () => {
  const config = {
    activeDepartments: ['executive', 'operations', 'marketing'],
    customAgents: [
      {
        id: 'growth_lead',
        name: 'Growth Lead',
        title: 'Head of Growth',
        department: 'marketing',
        lane: 'marketing',
        reports_to: 'cmo_agent',
        custom: true,
        prompt: 'You are the Growth Lead.',
      },
    ],
  };

  const cliRuntime = createCliRuntime(config);
  const webRuntime = createWebRuntime(config);
  const snapshot = runtime => ({
    agents: runtime.supervisor.listAgents().map(agent => agent.id),
    departments: runtime.departmentManager.listDepartments().map(department => department.id),
    models: runtime.modelBroker.listModels().map(model => model.id),
    registries: Object.keys(runtime.registries).sort(),
    organizationAgents: runtime.organization.listAgents().map(agent => agent.id),
  });

  assert.deepEqual(snapshot(cliRuntime), snapshot(webRuntime));
  assert.ok(snapshot(cliRuntime).agents.includes('growth_lead'));
});

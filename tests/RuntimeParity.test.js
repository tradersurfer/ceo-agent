const { test } = require('node:test');
const assert = require('node:assert/strict');
const AgentRegistry = require('../sdk/AgentRegistry');
const { buildConfiguredAgentList: buildCliAgentList } = require('../bin/chat');
const { buildConfiguredAgentList: buildWebAgentList } = require('../lib/ceoAgentServer');

test('CLI and web runtimes build the same agent list from the same config', () => {
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

  const cliIds = buildCliAgentList(new AgentRegistry(), config).map(agent => agent.id);
  const webIds = buildWebAgentList(new AgentRegistry(), config).map(agent => agent.id);

  assert.deepEqual(cliIds, webIds);
  assert.ok(cliIds.includes('growth_lead'));
});

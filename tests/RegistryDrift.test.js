const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Organization = require('../organization/Organization');
const AgentRegistry = require('../sdk/AgentRegistry');
const { createRuntime, SESSION_PROJECTS } = require('../core/runtimeFactory');

const ROOT = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', file), 'utf8'));
const sorted = values => [...values].sort();

test('Organization and agent registry match on canonical agent state', () => {
  const organization = Organization.createDefault();
  const registry = new AgentRegistry();
  const organizationAgents = new Map(organization.listAgents().map(agent => [agent.id, agent.getSummary()]));
  const registryAgents = new Map(registry.listAgents().map(agent => [agent.id, agent]));

  assert.deepEqual(sorted(organizationAgents.keys()), sorted(registryAgents.keys()));
  for (const [id, expected] of organizationAgents) {
    const actual = registryAgents.get(id);
    assert.equal(actual.title, expected.title, `${id} title drift`);
    assert.equal(actual.department, expected.department, `${id} department drift`);
    assert.equal(actual.role, expected.role, `${id} role drift`);
    assert.equal(actual.reports_to, expected.reportsTo, `${id} reporting drift`);
    assert.deepEqual(sorted(actual.capabilities), sorted(expected.capabilities), `${id} capability drift`);
    assert.deepEqual(sorted(actual.skills || []), sorted(expected.skills), `${id} skill assignment drift`);
  }
});

test('project, skill, tool, and workflow registries match connected runtime state', () => {
  const config = {
    agentName: 'CEO Agent',
    principalName: 'Test Principal',
    businessContext: 'Registry drift test',
    activeDepartments: ['executive', 'finance', 'operations', 'technology', 'marketing', 'people', 'legal'],
  };
  const runtime = createRuntime(config);
  const projects = read('project-registry.json');
  const skills = read('skill-registry.json');
  const tools = read('tool-registry.json');
  const workflows = read('workflow-registry.json');

  assert.deepEqual(sorted(projects.projects.map(project => project.runtimeId)), sorted(SESSION_PROJECTS));
  assert.deepEqual(
    skills.skills.map(skill => ({
      id: skill.id,
      capability: skill.capability,
      description: skill.description || null,
      disableModelInvocation: skill.disableModelInvocation || false,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema || {},
      permissions: skill.permissions || { requiresAgentAssignment: false },
    })),
    runtime.skillRegistry.list().map(skill => ({
      id: skill.name,
      capability: skill.capability,
      description: skill.description,
      disableModelInvocation: skill.disableModelInvocation,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      permissions: skill.permissions,
    })),
  );

  const toolActions = new Set(tools.tools.flatMap(tool => tool.actions));
  const executorTypes = new Set(runtime.workflowRuntime.executors.keys());
  assert.deepEqual(sorted(toolActions), sorted(executorTypes));
  assert.deepEqual(sorted(workflows.executorTypes), sorted(executorTypes));
  assert.deepEqual(workflows.workflows, runtime.registries.workflows.workflows);
  assert.deepEqual(
    sorted(runtime.registryCatalog.roles.map(role => role.id)),
    sorted(Organization.createDefault().listRoles().map(role => role.id)),
  );
  assert.deepEqual(
    sorted(runtime.registryCatalog.capabilities),
    sorted(Organization.createDefault().listAgents().flatMap(agent => agent.capabilities)),
  );
});

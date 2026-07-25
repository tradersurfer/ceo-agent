const path = require('path');
const AgentRegistry = require('../sdk/AgentRegistry');
const JECIRuntime = require('./JECIRuntime');
const Organization = require('../organization/Organization');
const { loadRuntimeRegistries } = require('./RegistryLoader');
const frameworkCatalog = require('./frameworks/catalog');
const { createWorkflowPersistence } = require('./persistence');

const SESSION_PROJECTS = Object.freeze(['cli-session', 'web-session']);

function buildActiveAgentList(registry, activeDepartments) {
  const allAgents = registry.listAgents();
  const activeSet = new Set(activeDepartments);
  return allAgents.filter(agent => {
    if (agent.id === 'ceo_agent') return true;
    const department = agent.department || agent.lane || null;
    if (department && activeSet.has(department)) return true;
    const manager = agent.reports_to
      ? allAgents.find(candidate => candidate.id === agent.reports_to)
      : null;
    return Boolean(manager && activeSet.has(manager.department || manager.lane));
  });
}

function buildConfiguredAgentList(registry, config) {
  const baseAgents = buildActiveAgentList(registry, config.activeDepartments);
  const customAgents = Array.isArray(config.customAgents) ? config.customAgents : [];
  return [...baseAgents, ...customAgents];
}

/**
 * Creates the canonical CEO Agent runtime used by CLI, web, dispatch, and
 * tests. Runtime construction and registry wiring belong here only.
 * @param {object} config Per-install CEO Agent config.
 * @param {object} options Injectable dependencies for tests/advanced installs.
 * @returns {JECIRuntime} Initialized runtime.
 */
function createRuntime(config, options = {}) {
  if (!config || !Array.isArray(config.activeDepartments)) {
    throw new TypeError('Runtime config with activeDepartments is required.');
  }

  const root = options.root || path.resolve(__dirname, '..');
  const agentRegistry = options.agentRegistry
    || new AgentRegistry(path.join(root, 'registry', 'agent-registry.json'));
  const organization = options.organization || Organization.createDefault();
  const activeAgents = buildConfiguredAgentList(agentRegistry, config);

  for (const agent of config.customAgents || []) organization.registerAgent({
    ...agent,
    department: agent.department || agent.lane,
    reportsTo: agent.reportsTo || agent.reports_to || null,
  });

  // Persistent workflow store + audit log when Supabase is configured; falls
  // back to WorkflowRuntime's in-memory defaults otherwise (createWorkflowPersistence
  // returns null when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are absent).
  // An explicitly injected workflowRuntimeOptions (tests/advanced installs) wins.
  const workflowRuntimeOptions = options.workflowRuntimeOptions || createWorkflowPersistence() || undefined;

  const connectedRegistries = loadRuntimeRegistries({
    root,
    organization,
    bridgeOptions: options.bridgeOptions,
    workflowRuntimeOptions,
    skillAudit: options.skillAudit,
  });

  const runtime = new JECIRuntime({
    config: {
      supervisorAgentId: 'ceo_agent',
      brandName: config.agentName,
      organization: config.businessContext,
      owner: config.principalName,
      departments: config.activeDepartments,
      models: options.models,
    },
    registry: activeAgents,
    logger: options.logger,
  });
  runtime.initialize();

  runtime.organization = organization;
  runtime.agentRegistry = agentRegistry;
  runtime.activeAgents = activeAgents;
  runtime.registries = connectedRegistries.documents;
  runtime.skillRegistry = connectedRegistries.skillRegistry;
  runtime.skillExecutor = connectedRegistries.skillExecutor;
  runtime.workflowRuntime = connectedRegistries.workflowRuntime;
  runtime.frameworkCatalog = frameworkCatalog;
  runtime.registryCatalog = {
    agents: activeAgents,
    roles: organization.listRoles().map(role => ({
      id: role.id,
      title: role.title,
      department: role.department,
      requiredCapabilities: [...role.requiredCapabilities],
    })),
    capabilities: [...new Set(organization.listAgents().flatMap(agent => agent.capabilities))],
    projects: connectedRegistries.documents.projects.projects,
    skills: connectedRegistries.documents.skills.skills,
    tools: connectedRegistries.documents.tools.tools,
    workflows: connectedRegistries.documents.workflows.workflows,
  };

  return runtime;
}

module.exports = {
  createRuntime,
  buildActiveAgentList,
  buildConfiguredAgentList,
  SESSION_PROJECTS,
};

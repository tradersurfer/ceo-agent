const fs = require('fs');
const path = require('path');
const { SkillRegistry } = require('./SkillRegistry');
const { SkillExecutor } = require('./SkillExecutor');
const { registerExampleSkills } = require('./skills/exampleSkills');
const { registerManagerSkills } = require('./skills/managerSkills');
const { registerScopeCreepSkill } = require('./skills/scopeCreepSkill');
const { registerSchemaMarkupSkills } = require('./skills/schemaMarkupSkills');
const { registerContentQualitySkill } = require('./skills/contentQualitySkill');
const { registerDocumentCreationSkills } = require('./skills/documentCreationSkills');
const { registerFinancialModelSkills } = require('./skills/financialModelSkill');
const { WorkflowRuntime } = require('./WorkflowRuntime');
const { registerBridgeExecutors } = require('./BridgeExecutors');

const REGISTRY_FILES = Object.freeze({
  projects: 'project-registry.json',
  skills: 'skill-registry.json',
  tools: 'tool-registry.json',
  workflows: 'workflow-registry.json',
});

function readRegistry(registryRoot, type, fileName) {
  const filePath = path.join(registryRoot, fileName);
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (document.registryType !== type || !Array.isArray(document[type])) {
    throw new TypeError(`${fileName} must declare registryType "${type}" and a ${type} array.`);
  }
  return document;
}

/**
 * Loads the four executable registries and connects their runtime
 * implementations. JSON files remain the declarative catalog; handlers stay
 * in code and are checked against the catalog so neither side can drift.
 * @param {object} options Loader options.
 * @returns {object} Loaded documents and connected runtime registries.
 */
function loadRuntimeRegistries(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const registryRoot = path.join(root, 'registry');
  const documents = Object.fromEntries(
    Object.entries(REGISTRY_FILES).map(([type, fileName]) => [
      type,
      readRegistry(registryRoot, type, fileName),
    ]),
  );

  const skillRegistry = new SkillRegistry();
  registerExampleSkills(skillRegistry);
  registerManagerSkills(skillRegistry, { organization: options.organization });
  registerScopeCreepSkill(skillRegistry);
  registerSchemaMarkupSkills(skillRegistry);
  registerContentQualitySkill(skillRegistry);
  registerDocumentCreationSkills(skillRegistry);
  registerFinancialModelSkills(skillRegistry);
  const skillExecutor = new SkillExecutor(skillRegistry, {
    agentResolver: options.organization
      ? agentId => options.organization.findAgent(agentId)
      : null,
    audit: options.skillAudit,
  });

  const workflowRuntime = new WorkflowRuntime(options.workflowRuntimeOptions);
  registerBridgeExecutors(workflowRuntime, options.bridgeOptions);

  return {
    documents,
    skillRegistry,
    skillExecutor,
    workflowRuntime,
  };
}

module.exports = { loadRuntimeRegistries, REGISTRY_FILES };

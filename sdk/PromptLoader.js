const fs = require('fs');
const path = require('path');

const PROMPT_PATHS = Object.freeze({
  ceo_agent: ['executive', 'ceo-agent', 'PROMPT.md'],
  cfo_agent: ['finance', 'cfo-agent', 'PROMPT.md'],
  hermes: ['operations', 'hermes', 'PROMPT.md'],
  cto_agent: ['technology', 'cto-agent', 'PROMPT.md'],
  cmo_agent: ['marketing', 'cmo-agent', 'PROMPT.md'],
  chro_agent: ['people', 'chro-agent', 'PROMPT.md'],
  clo_agent: ['legal', 'clo-agent', 'PROMPT.md'],
});

function substitutePlaceholders(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function loadAgentPrompt({ root, config, agent }) {
  const agentId = agent && agent.id ? agent.id : 'ceo_agent';
  const promptParts = PROMPT_PATHS[agentId] || PROMPT_PATHS.ceo_agent;
  const promptPath = path.join(root, 'departments', ...promptParts);
  const template = fs.readFileSync(promptPath, 'utf8');

  return substitutePlaceholders(template, {
    AGENT_NAME: agentId === 'ceo_agent'
      ? (config.agentName || 'CEO Agent')
      : (agent.name || agent.title || agentId),
    CEO_AGENT_NAME: config.agentName || 'CEO Agent',
    PRINCIPAL_NAME: config.principalName || 'the Principal',
    BUSINESS_CONTEXT: config.businessContext || 'the configured business',
    AGENT_TITLE: agent && agent.title ? agent.title : 'Chief Intelligence & Orchestration Agent',
  });
}

module.exports = { loadAgentPrompt, substitutePlaceholders, PROMPT_PATHS };

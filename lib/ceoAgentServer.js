const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');
const ENV_PATH = path.join(ROOT, '.env');

let envLoaded = false;
function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!config.costMode) config.costMode = 'flagship';
  return config;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Masks an API key for safe display — never send the real key back to the browser.
 * @param {string} key Raw key.
 * @returns {string|null} Masked key, or null if too short/absent.
 */
function maskKey(key) {
  if (!key || key.length < 8) return null;
  return `${key.slice(0, 7)}${'•'.repeat(Math.max(key.length - 11, 4))}${key.slice(-4)}`;
}

function setOpenRouterKey(newKey) {
  const envLine = `OPENROUTER_API_KEY=${newKey}\n`;
  if (fs.existsSync(ENV_PATH)) {
    const existing = fs.readFileSync(ENV_PATH, 'utf8');
    if (existing.includes('OPENROUTER_API_KEY=')) {
      fs.writeFileSync(ENV_PATH, existing.replace(/OPENROUTER_API_KEY=.*/g, envLine.trim()), 'utf8');
    } else {
      fs.appendFileSync(ENV_PATH, envLine, 'utf8');
    }
  } else {
    fs.writeFileSync(ENV_PATH, envLine, 'utf8');
  }
  process.env.OPENROUTER_API_KEY = newKey;
}

const AgentRegistry = require('../sdk/AgentRegistry');
const OpenRouterClient = require('../sdk/OpenRouterClient');
const JECIRuntime = require('../core/JECIRuntime');

function buildActiveAgentList(registry, activeDepartments) {
  const allAgents = registry.listAgents();
  const activeSet = new Set(activeDepartments);
  return allAgents.filter(agent => {
    if (agent.id === 'ceo_agent') return true;
    const dept = agent.department || agent.lane || null;
    if (dept && activeSet.has(dept)) return true;
    const reportsTo = agent.reports_to;
    if (reportsTo) {
      const head = allAgents.find(a => a.id === reportsTo);
      if (head && activeSet.has(head.lane)) return true;
    }
    return false;
  });
}

let cachedRuntime = null;
let cachedActiveAgents = null;
let modelsResolvedPromise = null;

/**
 * Returns a cached JECIRuntime built from the current local config, or nulls
 * if setup hasn't been run yet. The runtime is built once and reused across
 * requests within this server process — matching the CLI's "resolve once"
 * behavior rather than rebuilding on every call.
 * @returns {{runtime: object|null, config: object|null, activeAgents: object[]|null}}
 */
function getRuntime() {
  const config = loadConfig();
  if (!config) return { runtime: null, config: null, activeAgents: null };

  if (!cachedRuntime) {
    const registry = new AgentRegistry();
    cachedActiveAgents = buildActiveAgentList(registry, config.activeDepartments);
    cachedRuntime = new JECIRuntime({
      config: {
        supervisorAgentId: 'ceo_agent',
        brandName: config.agentName,
        organization: config.businessContext,
        owner: config.principalName,
        departments: config.activeDepartments,
      },
      registry: cachedActiveAgents,
    });
    cachedRuntime.initialize();
  }

  return { runtime: cachedRuntime, config, activeAgents: cachedActiveAgents };
}

const openRouterClient = new OpenRouterClient();

/**
 * Resolves live OpenRouter models once per server process (cached), not
 * once per request.
 * @param {object} runtime JECIRuntime instance.
 * @returns {Promise<boolean>} Whether a key is configured and resolution succeeded.
 */
async function ensureModelsResolved(runtime) {
  if (!process.env.OPENROUTER_API_KEY) return false;
  if (!modelsResolvedPromise) {
    modelsResolvedPromise = runtime.modelBroker.refreshFromOpenRouter(openRouterClient).catch(err => {
      modelsResolvedPromise = null;
      throw err;
    });
  }
  await modelsResolvedPromise;
  return true;
}

/** Forces the cached runtime to rebuild on next request (call after config changes). */
function resetRuntimeCache() {
  cachedRuntime = null;
  cachedActiveAgents = null;
  modelsResolvedPromise = null;
}

module.exports = {
  loadEnv,
  loadConfig,
  saveConfig,
  maskKey,
  setOpenRouterKey,
  getRuntime,
  ensureModelsResolved,
  resetRuntimeCache,
  openRouterClient,
};

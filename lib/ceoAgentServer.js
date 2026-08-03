const fs = require('fs');
const path = require('path');
const { PROVIDER_ENV_VARS } = require('./providers');
const { DEFAULT_CEO_MODE } = require('../core/ceoModes');

const ROOT = path.resolve(process.cwd());
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
  if (!config.ceoMode) config.ceoMode = DEFAULT_CEO_MODE;
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

/**
 * Writes (or replaces) one provider's API key as a `.env` line, and sets it
 * on `process.env` immediately so the running process picks it up without a
 * restart. Centralizes the read/regex-replace/append block that used to be
 * duplicated between here and `bin/setup.js` (see
 * docs/design/BYNGE-connection-scoping.md §2) — generalized to take a
 * provider id instead of being OpenRouter-specific, via the canonical
 * provider id -> env var table in `lib/providers.js`.
 * @param {string} providerId One of lib/providers.js's PROVIDER_IDS (e.g. "openrouter", "anthropic").
 * @param {string} newKey Raw API key value to store.
 * @param {string} [envPath] Path to the `.env` file to write. Defaults to
 *   this module's own process.cwd()-based ENV_PATH (correct for the Next.js
 *   server). Callers that must be cwd-independent — e.g. `bin/setup.js`,
 *   invoked as a CLI entry point from an arbitrary directory — should pass
 *   their own __dirname-resolved path explicitly.
 * @returns {string} The env var name the key was written under.
 */
function setProviderKey(providerId, newKey, envPath = ENV_PATH) {
  const envVar = PROVIDER_ENV_VARS[providerId];
  if (!envVar) {
    throw new Error(`Unknown provider id: ${providerId}`);
  }

  const envLine = `${envVar}=${newKey}\n`;
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    if (existing.includes(`${envVar}=`)) {
      const linePattern = new RegExp(`${envVar}=.*`, 'g');
      fs.writeFileSync(envPath, existing.replace(linePattern, envLine.trim()), 'utf8');
    } else {
      const needsNewline = existing.length > 0 && !existing.endsWith('\n');
      fs.appendFileSync(envPath, (needsNewline ? '\n' : '') + envLine, 'utf8');
    }
  } else {
    fs.writeFileSync(envPath, envLine, 'utf8');
  }
  process.env[envVar] = newKey;
  return envVar;
}

const OpenRouterClient = require('../sdk/OpenRouterClient');
const AnthropicClient = require('../sdk/AnthropicClient');
const OpenAIClient = require('../sdk/OpenAIClient');
const GoogleClient = require('../sdk/GoogleClient');
const XaiClient = require('../sdk/XaiClient');
const { loadAgentPrompt } = require('../sdk/PromptLoader');
const {
  createRuntime,
  buildActiveAgentList,
  buildConfiguredAgentList,
} = require('../core/runtimeFactory');

function buildSystemPrompt(config, agent) {
  return loadAgentPrompt({ root: ROOT, config, agent });
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
    cachedRuntime = createRuntime(config, { root: ROOT });
    cachedActiveAgents = cachedRuntime.activeAgents;
  }

  return { runtime: cachedRuntime, config, activeAgents: cachedActiveAgents };
}

const openRouterClient = new OpenRouterClient();
// Constructed once per server process, same lifetime/staleness contract as
// openRouterClient above (its apiKey is captured at construction time; a
// key saved via setProviderKey() after this module loads takes effect on
// the next process restart, matching openRouterClient's existing behavior
// — not a new limitation introduced here). Safe to construct unconditionally
// even with no ANTHROPIC_API_KEY set; its own methods throw a clear error if
// called without a key, same pattern as OpenRouterClient#chatCompletion.
const anthropicClient = new AnthropicClient();
// Same construction/staleness contract as anthropicClient above, for
// OPENAI_API_KEY (BYNGE Phase 2's second provider PR, sdk/OpenAIClient.js).
const openAIClient = new OpenAIClient();
// Same construction/staleness contract as anthropicClient/openAIClient
// above, for GOOGLE_AI_STUDIO_API_KEY (BYNGE Phase 2's third provider PR,
// sdk/GoogleClient.js).
const googleClient = new GoogleClient();
// Same construction/staleness contract as the three clients above, for
// XAI_API_KEY (BYNGE Phase 2's fourth and last provider PR, sdk/XaiClient.js).
const xaiClient = new XaiClient();

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
  setProviderKey,
  buildSystemPrompt,
  createRuntime,
  buildActiveAgentList,
  buildConfiguredAgentList,
  getRuntime,
  ensureModelsResolved,
  resetRuntimeCache,
  openRouterClient,
  anthropicClient,
  openAIClient,
  googleClient,
  xaiClient,
};

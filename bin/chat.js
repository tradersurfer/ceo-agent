#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');
const ENV_PATH = path.join(ROOT, '.env');

const colorEnabled = !process.env.NO_COLOR && process.stdout.isTTY;
function paint(code, text) {
  return colorEnabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const cyan = text => paint(36, text);
const gray = text => paint(90, text);
const bold = text => paint(1, text);

// Markdown rendering for agent responses: only in color-capable TTYs — the
// same gate as every other ANSI-styled output in this file. In non-TTY/
// NO_COLOR contexts, print the raw text unchanged (the prior behavior),
// rather than emitting HTML tags a plain-text renderer would produce.
let renderMarkdown = text => text;
if (colorEnabled) {
  const { marked } = require('marked');
  const { markedTerminal } = require('marked-terminal');
  marked.use(markedTerminal());
  renderMarkdown = text => {
    try {
      return marked.parse(text).trimEnd();
    } catch {
      return text;
    }
  };
}

function loadEnv() {
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

const OpenRouterClient = require('../sdk/OpenRouterClient');
const AnthropicClient = require('../sdk/AnthropicClient');
const { loadAgentPrompt } = require('../sdk/PromptLoader');
const {
  createRuntime,
  buildActiveAgentList,
  buildConfiguredAgentList,
} = require('../core/runtimeFactory');
const { friendlyMessageFor } = require('../lib/userMessages');
const { saveUpload, MAX_UPLOAD_BYTES } = require('../lib/uploadStore');
const { recordUsage } = require('../core/UsageTracker');
const { resolveRoleForAgent } = require('../core/resolveDepartmentRole');
const { resolveClientForModel } = require('../core/resolveClientForModel');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('\nNo configuration found. Run setup first:\n  node bin/setup.js\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function buildSystemPrompt(config, agent) {
  return loadAgentPrompt({ root: ROOT, config, agent });
}

function formatUsageLine(usage) {
  if (!usage) return null;
  const parts = [];
  if (usage.promptTokens != null) parts.push(`prompt=${usage.promptTokens}`);
  if (usage.completionTokens != null) parts.push(`completion=${usage.completionTokens}`);
  const cached = usage.cachedTokens ?? usage.cacheReadTokens;
  if (cached != null && cached > 0) parts.push(`cached=${cached}`);
  if (parts.length === 0) return null;
  return `[tokens: ${parts.join(' ')}]`;
}

async function main() {
  const config = loadConfig();
  if (!config.costMode) config.costMode = 'flagship'; // backward compatibility for pre-existing configs

  const runtime = createRuntime(config, { root: ROOT });

  const openRouterClient = new OpenRouterClient();
  const anthropicClient = new AnthropicClient();
  let liveModelsResolved = false;

  console.log('');
  console.log(cyan('========================================='));
  console.log(cyan(`  ${config.agentName}`));
  console.log(gray(`  Reporting relationship: ${config.principalName || 'you'}`));
  console.log(cyan('========================================='));
  console.log('');
  console.log(`Business: ${config.businessContext || 'not specified'}`);
  console.log(`Active departments: ${config.activeDepartments.join(', ')}`);
  console.log(`Cost mode: ${config.costMode}`);
  console.log('');

  if (!process.env.OPENROUTER_API_KEY) {
    console.log('  ! OPENROUTER_API_KEY is not set — responses will be routing-only.');
    console.log('    Add it to .env or re-run `node bin/setup.js` to enable live responses.');
    console.log('');
  } else {
    process.stdout.write('  Resolving live model catalog from OpenRouter... ');
    try {
      await runtime.modelBroker.refreshFromOpenRouter(openRouterClient);
      liveModelsResolved = true;
      console.log('done.');
    } catch (err) {
      console.log('failed.');
      console.log(`    ${friendlyMessageFor('model_resolution_failed', err.message)}`);
    }
    console.log('');
  }

  console.log('Commands: /org  /status  /models  /cost  /help  /exit');
  console.log('Address a department directly with @department, e.g. "@legal draft an NDA clause"');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  let pendingAttachments = [];

  rl.on('line', async line => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/exit' || input === '/quit') {
      console.log('Goodbye.');
      rl.close();
      return;
    }

    if (input === '/help') {
      console.log('');
      console.log('  /org               Show the active org chart');
      console.log('  /status            Show runtime + agent status');
      console.log('  /models            Show resolved model assignments (both tiers)');
      console.log('  /cost              Show or change cost mode (flagship/efficient)');
      console.log('  /attach <path>     Attach a local file to your next message');
      console.log('  @department <msg>  Address a department head directly');
      console.log('  <anything else>    Talk to the CEO Agent directly');
      console.log('  /exit              Quit');
      console.log('');
      rl.prompt();
      return;
    }

    const attachMatch = input.match(/^\/attach\s+(.+)$/);
    if (attachMatch) {
      const filePath = attachMatch[1].trim().replace(/^"(.*)"$/, '$1');
      try {
        const resolved = path.resolve(filePath);
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) throw new Error('Not a regular file.');
        if (stat.size > MAX_UPLOAD_BYTES) throw new Error(`File exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
        const buffer = fs.readFileSync(resolved);
        const metadata = saveUpload({ filename: path.basename(resolved), buffer });
        pendingAttachments.push(metadata);
        console.log(`\n  Attached: ${metadata.filename} (${metadata.size} bytes) — will be sent with your next message.\n`);
      } catch (err) {
        console.log(`\n  Could not attach "${filePath}": ${err.message}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === '/org') {
      console.log('');
      for (const agent of runtime.supervisor.listAgents()) {
        const dept = agent.department || agent.lane || 'unassigned';
        const reportsTo = agent.reports_to || 'nobody (top of chart)';
        console.log(`  ${agent.name} (${agent.id})  —  ${dept}  —  reports to: ${reportsTo}`);
      }
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/status') {
      console.log('');
      console.log(JSON.stringify(runtime.getStatus(), null, 2));
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/models') {
      console.log('');
      if (!liveModelsResolved) {
        console.log('  No live model resolution available (OPENROUTER_API_KEY not set or fetch failed).');
      } else {
        for (const model of runtime.modelBroker.listModels()) {
          if (model.tiers) {
            const flagship = model.tiers.flagship;
            const efficient = model.tiers.efficient;
            console.log(`  ${model.id.padEnd(8)} flagship:  ${flagship ? flagship.apiModelId : '(none)'}`);
            console.log(`  ${''.padEnd(8)} efficient: ${efficient ? efficient.apiModelId : '(none)'}`);
          }
        }
      }
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/cost') {
      console.log('');
      console.log(`  Current cost mode: ${config.costMode}`);
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/cost flagship' || input === '/cost efficient') {
      config.costMode = input.endsWith('flagship') ? 'flagship' : 'efficient';
      saveConfig(config);
      console.log('');
      console.log(`  Cost mode set to: ${config.costMode}`);
      console.log('');
      rl.prompt();
      return;
    }

    let target = null;
    let message = input;
    const atMatch = input.match(/^@(\S+)\s+([\s\S]+)/);
    if (atMatch) {
      target = atMatch[1].toLowerCase();
      message = atMatch[2];
    }

    const attachmentIds = pendingAttachments.map(a => a.fileId);
    const attachedThisTurn = pendingAttachments;
    pendingAttachments = [];

    let decision;
    if (!target) {
      decision = runtime.routeTask({
          assignedAgent: 'ceo_agent',
          goal: message,
          task: message,
          project: 'cli-session',
          approved_by: 'ceo_agent',
          attachmentIds,
        });
    } else {
      decision = runtime.routeTask({
          assignedAgent: target,
          goal: message,
          task: message,
          project: 'cli-session',
          approved_by: 'ceo_agent',
          attachmentIds,
        });
      if (decision.status !== 'routed') {
        decision = runtime.routeTask({
          department: target,
          goal: message,
          task: message,
          project: 'cli-session',
          approved_by: 'ceo_agent',
          attachmentIds,
        });
      }
    }

    if (decision.status !== 'routed') {
      console.log('');
      console.log(friendlyMessageFor(decision.status, decision.reason));
      console.log('');
      rl.prompt();
      return;
    }

    const agent = decision.agent;
    console.log('');
    console.log(`(routed to ${agent.name})`);
    if (attachedThisTurn.length > 0) {
      console.log(`(with ${attachedThisTurn.length} attachment${attachedThisTurn.length === 1 ? '' : 's'}: ${attachedThisTurn.map(a => a.filename).join(', ')})`);
    }

    if (!liveModelsResolved) {
      console.log(`  ${friendlyMessageFor('no_api_key')}`);
      console.log('');
      rl.prompt();
      return;
    }

    const roleForAgent = resolveRoleForAgent(agent, config.departmentModelDefaults);
    const apiModelId = runtime.modelBroker.getApiModelId(roleForAgent, config.costMode);

    if (!apiModelId) {
      console.log(`  ${friendlyMessageFor('no_model')}`);
      console.log('');
      rl.prompt();
      return;
    }

    try {
      // Dispatch seam (ADR-006): route through a direct provider client when
      // one is connected for apiModelId's provider, else OpenRouter unchanged
      // — this does not change role->model resolution (roleForAgent/
      // apiModelId above), only which client places the already-resolved call.
      const { client, providerModelId } = resolveClientForModel(apiModelId, {
        openrouter: openRouterClient,
        anthropic: process.env.ANTHROPIC_API_KEY ? anthropicClient : null,
      });
      const { text, usage } = await client.chatCompletion({
        model: providerModelId,
        messages: [
          { role: 'system', content: buildSystemPrompt(config, agent) },
          { role: 'user', content: message },
        ],
      });
      console.log('');
      console.log(renderMarkdown(text.trim()));
      const usageLine = formatUsageLine(usage);
      if (usageLine) console.log(`\n  ${usageLine}`);
      console.log('');
      recordUsage(runtime.usageAudit, {
        model: apiModelId,
        role: roleForAgent,
        costTier: config.costMode,
        agentId: agent.id,
        usage,
        pricing: runtime.modelBroker.getPricing(roleForAgent, config.costMode),
      }).catch(() => {}); // best-effort — never let audit persistence disrupt the chat response
    } catch (err) {
      console.log(`  ${friendlyMessageFor('model_call_failed', err.message)}`);
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

if (require.main === module) {
  main().catch(err => {
    console.error('CEO Agent failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { createRuntime, buildActiveAgentList, buildConfiguredAgentList, main };

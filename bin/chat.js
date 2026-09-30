#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ui = require('./cliTheme');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');
const ENV_PATH = path.join(ROOT, '.env');

const colorEnabled = ui.colorEnabled;

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
const OpenAIClient = require('../sdk/OpenAIClient');
const GoogleClient = require('../sdk/GoogleClient');
const XaiClient = require('../sdk/XaiClient');
const OpenCodeZenClient = require('../sdk/OpenCodeZenClient');
const { loadAgentPrompt } = require('../sdk/PromptLoader');
const {
  createRuntime,
  buildActiveAgentList,
  buildConfiguredAgentList,
} = require('../ceo-core/runtimeFactory');
const { friendlyMessageFor } = require('../lib/userMessages');
const { saveUpload, MAX_UPLOAD_BYTES } = require('../lib/uploadStore');
const { recordUsage } = require('../ceo-core/UsageTracker');
const { resolveRoleForAgent } = require('../ceo-core/resolveDepartmentRole');
const { resolveClientForModel } = require('../ceo-core/resolveClientForModel');
const { CEO_MODES, DEFAULT_CEO_MODE } = require('../ceo-core/ceoModes');
const { dispatchSkillMessage } = require('../ceo-core/skillDispatch');

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

function printSkillResult(skillName, result) {
  console.log('');
  console.log(ui.skillLine(skillName, result.status === 'ok', result.reason));
  if (result.status === 'ok') {
    console.log(JSON.stringify(result.output, null, 2));
  } else {
    console.log(ui.errorLine(result.error));
  }
  console.log('');
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
  if (!config.ceoMode) config.ceoMode = DEFAULT_CEO_MODE; // backward compatibility for pre-existing configs

  // `let`, not `const`: /mode rebuilds this after a mode change, same as
  // the web side's resetRuntimeCache()+lazy-rebuild (lib/ceoAgentServer.js)
  // — escalation_assessment/quality_review's ceoMode is resolved once at
  // registerManagerSkills() time (a closure), so changing config.ceoMode
  // alone would not actually affect the next skill call without this.
  let runtime = createRuntime(config, { root: ROOT });

  const openRouterClient = new OpenRouterClient();
  const anthropicClient = new AnthropicClient();
  const openAIClient = new OpenAIClient();
  const googleClient = new GoogleClient();
  const xaiClient = new XaiClient();
  const openCodeZenClient = new OpenCodeZenClient();
  let liveModelsResolved = false;
  let freeDefaultId = null;
  let freeCount = 0;

  console.log(ui.banner(config.agentName, config.principalName));

  // The free roster resolves from OpenRouter's ':free' variants and OpenCode
  // Zen's '-free' models, BOTH of which are keyless (verified live). So it is
  // attempted unconditionally — a fresh install with no credentials still
  // gets a working zero-cost tier, and only the paid tiers stay gated on
  // OPENROUTER_API_KEY.
  process.stdout.write(ui.hintLine('Resolving free model roster (no API key required)... '));
  try {
    const freeResult = await runtime.modelBroker.refreshFreeModels(openRouterClient, openCodeZenClient);
    if (freeResult.resolved) {
      freeCount = freeResult.count;
      freeDefaultId = freeResult.best && freeResult.best.apiModelId;
      console.log(ui.theme.success(`done (${freeResult.count} free models).`));
    } else {
      console.log(ui.theme.warn('no free models found.'));
      for (const err of freeResult.errors) console.log(ui.hintLine(err));
    }
  } catch (err) {
    console.log(ui.theme.danger('failed.'));
    console.log(ui.errorLine(err.message));
  }

  let catalogLabel = 'not resolved';
  if (!process.env.OPENROUTER_API_KEY) {
    catalogLabel = 'paid tiers unavailable (no OPENROUTER_API_KEY)';
  } else {
    process.stdout.write(ui.hintLine('Resolving live model catalog from OpenRouter... '));
    try {
      await runtime.modelBroker.refreshFromOpenRouter(openRouterClient);
      liveModelsResolved = true;
      catalogLabel = 'OpenRouter live';
      console.log(ui.theme.success('done.'));
    } catch (err) {
      catalogLabel = 'OpenRouter fetch failed';
      console.log(ui.theme.danger('failed.'));
      console.log(ui.errorLine(friendlyMessageFor('model_resolution_failed', err.message)));
    }
  }

  console.log(ui.statusBlock(config, {
    ceoMode: runtime.ceoMode.label,
    freeDefault: freeDefaultId ? `${freeDefaultId}  (${freeCount})` : null,
    catalog: catalogLabel,
  }));

  if (!process.env.OPENROUTER_API_KEY) {
    console.log(ui.warnLine('OPENROUTER_API_KEY is not set — paid model tiers are unavailable.'));
    console.log(ui.hintLine('Add it to .env or re-run `node bin/setup.js` for the paid roles.'));
    console.log(ui.hintLine('The Free role above works without a key.'));
    console.log('');
  }

  console.log(ui.commandStrip());
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ui.promptString(),
  });
  rl.prompt();

  let pendingAttachments = [];

  rl.on('line', async line => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/exit' || input === '/quit') {
      console.log(ui.theme.muted('Goodbye.'));
      rl.close();
      return;
    }

    if (input === '/help') {
      console.log(ui.section('commands'));
      console.log('  /org               Show the active org chart');
      console.log('  /status            Show runtime + agent status');
      console.log('  /models            Show resolved model assignments (both tiers)');
      console.log('  /cost              Show or change cost mode (flagship/efficient)');
      console.log('  /mode              Show or change CEO mode');
      console.log('  /skills            List registered skills and their arguments');
      console.log('  /attach <path>     Attach a local file to your next message');
      console.log('  @department <msg>  Address a department head directly');
      console.log('  /<skill> {json}    Run a registered skill directly, e.g. /format_currency {"amount": 42.5}');
      console.log('  @<skill> {json}    Same, via @ addressing');
      console.log('  <anything else>    Talk to the CEO Agent directly');
      console.log('  /exit              Quit');
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/skills') {
      console.log(ui.section('skills'));
      for (const skill of runtime.skillRegistry.list()) {
        console.log(`  ${ui.theme.accent(skill.name)}${skill.description ? ui.theme.muted(` — ${skill.description}`) : ''}`);
        const fields = Object.keys(skill.inputSchema || {});
        if (fields.length) console.log(ui.hintLine(`args: { ${fields.join(', ')} }`));
      }
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
        console.log('');
        console.log(ui.okLine(`Attached: ${metadata.filename} (${metadata.size} bytes) — sent with your next message.`));
        console.log('');
      } catch (err) {
        console.log('');
        console.log(ui.errorLine(`Could not attach "${filePath}": ${err.message}`));
        console.log('');
      }
      rl.prompt();
      return;
    }

    if (input === '/org') {
      console.log(ui.section('org'));
      for (const agent of runtime.supervisor.listAgents()) {
        const dept = agent.department || agent.lane || 'unassigned';
        const reportsTo = agent.reports_to || 'nobody (top of chart)';
        console.log(`  ${ui.theme.accent(agent.name)} ${ui.theme.muted(`(${agent.id})`)}  ${ui.theme.muted('—')}  ${dept}  ${ui.theme.muted('→')}  ${reportsTo}`);
      }
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/status') {
      console.log(ui.section('status'));
      console.log(JSON.stringify(runtime.getStatus(), null, 2));
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/models') {
      console.log(ui.section('models'));
      if (!liveModelsResolved) {
        console.log(ui.warnLine('No live paid-model resolution (OPENROUTER_API_KEY not set or fetch failed).'));
      } else {
        for (const model of runtime.modelBroker.listModels()) {
          if (model.tiers) {
            const flagship = model.tiers.flagship;
            const efficient = model.tiers.efficient;
            console.log(`  ${ui.theme.accent(model.id.padEnd(8))} flagship:  ${flagship ? flagship.apiModelId : '(none)'}`);
            console.log(`  ${''.padEnd(8)} efficient: ${efficient ? efficient.apiModelId : '(none)'}`);
          }
        }
      }
      // Shown regardless of the paid-resolution gate above: the free roster
      // is keyless and can be live even with no OpenRouter key at all.
      const freeRole = runtime.modelBroker.getModel('free');
      const freeModels = freeRole && freeRole.freeModels;
      if (freeModels && freeModels.length > 0) {
        console.log('');
        console.log(ui.hintLine(`Free roster (${freeModels.length} models, $0):`));
        for (const m of freeModels) {
          const ctx = m.contextLength ? `${(m.contextLength / 1000).toFixed(0)}k ctx` : 'ctx unknown';
          const isDefault = freeRole.tiers && freeRole.tiers.free && freeRole.tiers.free.apiModelId === m.apiModelId;
          const mark = isDefault ? ui.theme.success('*') : ' ';
          console.log(`   ${mark} ${m.apiModelId.padEnd(48)} ${String(m.source).padEnd(11)} ${ctx}`);
        }
        console.log(ui.hintLine('(* = default for the Free role)'));
      }
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/cost') {
      console.log(ui.section('cost'));
      console.log(ui.kv('current', config.costMode));
      console.log(ui.hintLine('set with /cost flagship  or  /cost efficient'));
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/cost flagship' || input === '/cost efficient') {
      config.costMode = input.endsWith('flagship') ? 'flagship' : 'efficient';
      saveConfig(config);
      console.log('');
      console.log(ui.okLine(`Cost mode set to: ${config.costMode}`));
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/mode') {
      console.log(ui.section('ceo mode'));
      console.log(ui.kv('current', `${runtime.ceoMode.label} (${runtime.ceoMode.hint})`));
      console.log(ui.kv('available', Object.values(CEO_MODES).map(m => m.id).join(', ')));
      console.log('');
      rl.prompt();
      return;
    }

    const modeMatch = input.match(/^\/mode\s+(\S+)$/);
    if (modeMatch && CEO_MODES[modeMatch[1]]) {
      config.ceoMode = modeMatch[1];
      saveConfig(config);
      // Rebuild so the new mode's threshold actually applies to the next
      // escalation_assessment/quality_review call — see the comment on
      // `let runtime` above for why this isn't just a config write.
      runtime = createRuntime(config, { root: ROOT });
      console.log('');
      console.log(ui.okLine(`CEO mode set to: ${runtime.ceoMode.label} (${runtime.ceoMode.hint})`));
      console.log('');
      rl.prompt();
      return;
    }

    const skillDispatch = await dispatchSkillMessage(input, {
      skillRegistry: runtime.skillRegistry,
      skillExecutor: runtime.skillExecutor,
      agentId: 'ceo_agent',
    });
    if (skillDispatch) {
      printSkillResult(skillDispatch.skillName, skillDispatch.result);
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
      console.log(ui.warnLine(friendlyMessageFor(decision.status, decision.reason)));
      console.log('');
      rl.prompt();
      return;
    }

    const agent = decision.agent;
    console.log('');
    console.log(ui.routedLine(agent.name));
    if (attachedThisTurn.length > 0) {
      console.log(ui.attachLine(attachedThisTurn.map(a => a.filename).join(', ')));
    }

    if (!liveModelsResolved) {
      console.log(ui.warnLine(friendlyMessageFor('no_api_key')));
      console.log('');
      rl.prompt();
      return;
    }

    const roleForAgent = resolveRoleForAgent(agent, config.departmentModelDefaults);
    const apiModelId = runtime.modelBroker.getApiModelId(roleForAgent, config.costMode);

    if (!apiModelId) {
      console.log(ui.errorLine(friendlyMessageFor('no_model')));
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
        openai: process.env.OPENAI_API_KEY ? openAIClient : null,
        google: process.env.GOOGLE_AI_STUDIO_API_KEY ? googleClient : null,
        xai: process.env.XAI_API_KEY ? xaiClient : null,
        // Passed unconditionally — Zen's free models are completable with
        // no key (verified live), so gating on OPENCODE_ZEN_API_KEY would
        // make the zero-cost tier unreachable on a keyless install.
        opencode: openCodeZenClient,
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
      if (usageLine) console.log('\n' + ui.usageLine(usageLine));
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
      console.log(ui.errorLine(friendlyMessageFor('model_call_failed', err.message)));
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

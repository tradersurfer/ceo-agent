#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');
const ENV_PATH = path.join(ROOT, '.env');

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

const AgentRegistry = require('../sdk/AgentRegistry');
const OpenRouterClient = require('../sdk/OpenRouterClient');
const JECIRuntime = require('../core/JECIRuntime');

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

function buildSystemPrompt(config, agent) {
  const name = config.agentName || 'CEO Agent';
  const principal = config.principalName || 'the Principal';
  const business = config.businessContext || 'a business';
  if (!agent || agent.id === 'ceo_agent') {
    return `You are ${name}, the Chief Intelligence & Orchestration Agent for ${business}. You report to and answer directly to ${principal}. You speak with clarity, authority, and directness. You own outcomes and give concrete, useful answers, not vague plans.`;
  }
  return `You are ${agent.name}, the ${agent.title} at ${business}. You report to ${name} (the CEO Agent). ${principal} is the ultimate human principal. Answer within your domain expertise with clarity and directness.`;
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

  const registry = new AgentRegistry();
  const activeAgents = buildActiveAgentList(registry, config.activeDepartments);

  const runtime = new JECIRuntime({
    config: {
      supervisorAgentId: 'ceo_agent',
      brandName: config.agentName,
      organization: config.businessContext,
      owner: config.principalName,
      departments: config.activeDepartments,
    },
    registry: activeAgents,
  });
  runtime.initialize();

  const openRouterClient = new OpenRouterClient();
  let liveModelsResolved = false;

  console.log('');
  console.log('=========================================');
  console.log(`  ${config.agentName}`);
  console.log(`  Reporting relationship: ${config.principalName || 'you'}`);
  console.log('=========================================');
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
      console.log(`    (${err.message}) — falling back to routing-only mode.`);
    }
    console.log('');
  }

  console.log('Commands: /org  /status  /models  /cost  /help  /exit');
  console.log('Address a department directly with @department, e.g. "@legal draft an NDA clause"');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

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
      console.log('  @department <msg>  Address a department head directly');
      console.log('  <anything else>    Talk to the CEO Agent directly');
      console.log('  /exit              Quit');
      console.log('');
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

    let targetDepartment = null;
    let message = input;
    const deptMatch = input.match(/^@(\S+)\s+([\s\S]+)/);
    if (deptMatch) {
      targetDepartment = deptMatch[1].toLowerCase();
      message = deptMatch[2];
    }

    const decision = targetDepartment
      ? runtime.routeTask({
          department: targetDepartment,
          goal: message,
          task: message,
          project: 'cli-session',
          approved_by: 'ceo_agent',
        })
      : runtime.routeTask({
          assignedAgent: 'ceo_agent',
          goal: message,
          task: message,
          project: 'cli-session',
          approved_by: 'ceo_agent',
        });

    if (decision.status !== 'routed') {
      console.log('');
      console.log(`[${decision.status}] ${decision.reason || 'Could not route this message.'}`);
      console.log('');
      rl.prompt();
      return;
    }

    const agent = decision.agent;
    console.log('');
    console.log(`(routed to ${agent.name})`);

    if (!liveModelsResolved) {
      console.log('  Live responses are not enabled — set OPENROUTER_API_KEY to talk to the model.');
      console.log('');
      rl.prompt();
      return;
    }

    const roleForAgent = (agent.department === 'technology' || agent.lane === 'technology') ? 'codex' : 'claude';
    const apiModelId = runtime.modelBroker.getApiModelId(roleForAgent, config.costMode);

    if (!apiModelId) {
      console.log(`  No resolved model available for this agent role at cost mode "${config.costMode}".`);
      console.log('');
      rl.prompt();
      return;
    }

    try {
      const { text, usage } = await openRouterClient.chatCompletion({
        model: apiModelId,
        messages: [
          { role: 'system', content: buildSystemPrompt(config, agent) },
          { role: 'user', content: message },
        ],
      });
      console.log('');
      console.log(text.trim());
      const usageLine = formatUsageLine(usage);
      if (usageLine) console.log(`\n  ${usageLine}`);
      console.log('');
    } catch (err) {
      console.log(`  Model call failed: ${err.message}`);
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main().catch(err => {
  console.error('CEO Agent failed to start:', err.message);
  process.exit(1);
});

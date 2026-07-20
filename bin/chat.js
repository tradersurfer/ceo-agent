#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');

const AgentRegistry = require('../sdk/AgentRegistry');
const Supervisor = require('../sdk/Supervisor');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('');
    console.log('No configuration found. Run setup first:');
    console.log('  node bin/setup.js');
    console.log('');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function buildActiveAgentList(registry, activeDepartments) {
  const allAgents = registry.listAgents();
  const activeSet = new Set(activeDepartments);
  return allAgents.filter(agent => {
    if (agent.id === 'ceo_agent') return true;
    const dept = agent.department || agent.lane || null;
    if (dept && activeSet.has(dept)) return true;
    // Sub-agents (hermes, dispute_agent, etc.) stay active if their
    // supervising head's department is active.
    const reportsTo = agent.reports_to;
    if (reportsTo) {
      const head = allAgents.find(a => a.id === reportsTo);
      if (head && activeSet.has(head.lane)) return true;
    }
    return false;
  });
}

function printHeader(config) {
  console.log('');
  console.log('=========================================');
  console.log(`  ${config.agentName}`);
  console.log(`  Reporting relationship: ${config.principalName || 'you'}`);
  console.log('=========================================');
  console.log('');
  console.log(`Business: ${config.businessContext || 'not specified'}`);
  console.log(`Active departments: ${config.activeDepartments.join(', ')}`);
  console.log('');
  console.log('Commands: /org  /status  /route  /help  /exit');
  console.log('');
}

async function main() {
  const config = loadConfig();
  const registry = new AgentRegistry();
  const activeAgents = buildActiveAgentList(registry, config.activeDepartments);
  const supervisor = new Supervisor({ id: 'ceo_agent', agentRegistry: activeAgents });

  printHeader(config);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  rl.on('line', line => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/exit' || input === '/quit') {
      console.log('Goodbye.');
      rl.close();
      return;
    }

    if (input === '/help') {
      console.log('');
      console.log('  /org               Show the active org chart');
      console.log('  /status            Show supervisor + agent health status');
      console.log('  /route <dept>      Show which agent handles a department');
      console.log('                     departments: ' + config.activeDepartments.join(', '));
      console.log('  /exit              Quit');
      console.log('');
      rl.prompt();
      return;
    }

    if (input === '/org') {
      console.log('');
      for (const agent of supervisor.listAgents()) {
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
      console.log(JSON.stringify(supervisor.reportStatus(), null, 2));
      console.log('');
      rl.prompt();
      return;
    }

    if (input.startsWith('/route ')) {
      const department = input.slice('/route '.length).trim();
      const decision = supervisor.receiveTask({
        department,
        goal: 'Manual routing check',
        task: 'Determine which agent handles this department',
        project: 'cli-check',
        approved_by: 'ceo_agent',
      });
      console.log('');
      console.log(JSON.stringify(decision, null, 2));
      console.log('');
      rl.prompt();
      return;
    }

    // Default: treat free-text input as a task for the CEO Agent to route.
    // NOTE: model-driven understanding of free text is not wired yet
    // (Phase 2/3). For now, this routes to the executive lane and reports
    // the routing decision only — it does not execute or generate a reply.
    const decision = supervisor.receiveTask({
      assignedAgent: 'ceo_agent',
      goal: input,
      task: input,
      project: 'cli-session',
      approved_by: 'ceo_agent',
    });
    console.log('');
    console.log(`[${decision.status}] Routed to: ${decision.agentId || 'none'}`);
    if (decision.reason) console.log(`  Reason: ${decision.reason}`);
    console.log('');
    console.log('  (Note: live model responses aren\'t wired yet — this build');
    console.log('   shows real routing decisions only. Full runtime wiring is next.)');
    console.log('');
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main().catch(err => {
  console.error('CEO Agent failed to start:', err.message);
  process.exit(1);
});

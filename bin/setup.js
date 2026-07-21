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
const green = text => paint(32, text);
const amber = text => paint(33, text);
const bold = text => paint(1, text);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = '') {
  return new Promise(resolve => {
    const suffix = defaultValue ? gray(` (${defaultValue})`) : '';
    rl.question(`  ${question}${suffix} ${cyan('›')} `, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function askSecret(question) {
  return new Promise(resolve => {
    rl.question(`  ${question} ${cyan('›')} `, answer => resolve(answer.trim()));
  });
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} ${gray(`[${hint}]`)}`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

function stepHeader(step, total, title) {
  console.log('');
  console.log(gray('─────────────────────────────────────────────────'));
  console.log(gray(` step ${step} of ${total} `) + bold(`— ${title}`));
  console.log(gray('─────────────────────────────────────────────────'));
}

const BANNER = `${cyan(`╔══════════════════════════════════════════════════╗
║                                                    ║
║    ██████╗███████╗ ██████╗      █████╗  ██████╗   ║
║   ██╔════╝██╔════╝██╔═══██╗    ██╔══██╗██╔════╝   ║
║   ██║     █████╗  ██║   ██║    ███████║██║  ███╗  ║
║   ██║     ██╔══╝  ██║   ██║    ██╔══██║██║   ██║  ║
║   ╚██████╗███████╗╚██████╔╝    ██║  ██║╚██████╔╝  ║
║    ╚═════╝╚══════╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝   ║
║                                                    ║
║`)}          the ai that runs your ai workforce       ${cyan('║')}
${cyan('║                                                    ║')}
${cyan('╚══════════════════════════════════════════════════╝')}`;

const ALL_DEPARTMENTS = [
  { id: 'finance', label: 'Finance (CFO)', bridges: [] },
  { id: 'operations', label: 'Operations (COO)', bridges: ['Hermes'] },
  { id: 'technology', label: 'Technology (CTO)', bridges: [] },
  { id: 'marketing', label: 'Marketing (CMO)', bridges: ['Sales Intake Agent', 'Onboarding Comms Agent'] },
  { id: 'people', label: 'People (CHRO)', bridges: [] },
  { id: 'legal', label: 'Legal (CLO)', bridges: ['Dispute Agent'] },
];

function printSummary(config, activeDeptIds) {
  console.log('');
  console.log(gray('─────────────────────────────────────────────────'));
  console.log(bold(`${config.agentName} is ready`));
  console.log(gray('─────────────────────────────────────────────────'));
  console.log(`  reports to:   ${config.principalName}`);
  console.log(`  business:     ${config.businessContext}`);
  console.log(`  cost mode:    ${config.costMode}`);
  console.log('');
  console.log('  her team:');
  for (const dept of ALL_DEPARTMENTS) {
    const active = activeDeptIds.has(dept.id);
    const mark = active ? green('✓') : gray('✗');
    if (active) {
      const bridgeSuffix = dept.bridges.length ? gray(`  →  ${dept.bridges.join(', ')}`) : '';
      console.log(`    ${mark} ${dept.label.padEnd(20)}${bridgeSuffix}`);
    } else {
      console.log(`    ${mark} ${gray(dept.label + '  not activated')}`);
    }
  }
  console.log('');
  console.log(amber('  starting your first conversation now...'));
  console.log('');
}

async function main() {
  console.log('');
  console.log(BANNER);
  console.log('');
  console.log(gray("  let's get your CEO Agent set up. about two minutes,"));
  console.log(gray('  and you can re-run this anytime to make changes.'));
  console.log('');
  await ask(amber('press enter to begin...'));

  stepHeader(1, 5, 'name your agent');
  console.log("  she's yours. what do you want to call her?");
  const agentName = await ask('', 'CEO Agent');

  stepHeader(2, 5, 'introduce yourself');
  console.log(`  what should ${agentName} call you?`);
  const principalName = await ask('');

  stepHeader(3, 5, 'tell her about your business');
  console.log('  in a sentence or two, what does your business do?');
  console.log(gray("  the more specific, the better she'll understand her job."));
  const businessContext = await ask('');

  stepHeader(4, 5, 'build her team');
  console.log(`  ${agentName} leads a standard executive team. turn on`);
  console.log('  whichever departments your business actually needs —');
  console.log('  you can always change this later.');
  console.log('');
  const activeDepartments = ['executive'];
  const activeDeptIds = new Set(['executive']);
  for (const dept of ALL_DEPARTMENTS) {
    const enabled = await askYesNo(`activate ${dept.label}?`, true);
    if (enabled) {
      activeDepartments.push(dept.id);
      activeDeptIds.add(dept.id);
    }
  }

  stepHeader(5, 5, 'cost and connection');
  console.log('  flagship gives the best response quality. efficient');
  console.log('  costs less per message. change anytime with /cost.');
  console.log('');
  const useFlagship = await askYesNo('use flagship by default?', true);
  const costMode = useFlagship ? 'flagship' : 'efficient';
  console.log('');
  console.log(`  to talk with ${agentName}, she needs an OpenRouter API key`);
  console.log(gray('  (openrouter.ai/keys — free to create).'));
  console.log('');
  const hasKey = await askYesNo('do you have one ready to add now?', false);
  let openRouterKey = '';
  if (hasKey) {
    openRouterKey = await askSecret("paste it here (won't be shown back)");
  } else {
    console.log(gray('  skipping — you can add OPENROUTER_API_KEY to .env later.'));
  }

  const config = {
    agentName,
    principalName,
    businessContext,
    operatingRhythm: 'Not specified',
    activeDepartments,
    costMode,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');

  if (openRouterKey) {
    const envLine = `OPENROUTER_API_KEY=${openRouterKey}\n`;
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
  }

  printSummary(config, activeDeptIds);

  rl.close();
  require('./chat.js');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  rl.close();
  process.exit(1);
});

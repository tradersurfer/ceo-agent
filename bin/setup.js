#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');
const ENV_PATH = path.join(ROOT, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = '') {
  return new Promise(resolve => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function askSecret(question) {
  return new Promise(resolve => {
    rl.question(`${question}: `, answer => resolve(answer.trim()));
  });
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} [${hint}]`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

const ALL_DEPARTMENTS = [
  { id: 'finance', label: 'Finance (CFO)' },
  { id: 'operations', label: 'Operations (COO)' },
  { id: 'technology', label: 'Technology (CTO)' },
  { id: 'marketing', label: 'Marketing (CMO)' },
  { id: 'people', label: 'People (CHRO)' },
  { id: 'legal', label: 'Legal (CLO)' },
];

async function main() {
  console.log('');
  console.log('=========================================');
  console.log('   CEO Agent — Setup');
  console.log('=========================================');
  console.log('');
  console.log("Let's configure your CEO Agent. You can re-run this anytime.");
  console.log('');

  const agentName = await ask('What do you want to name your CEO Agent?', 'CEO Agent');
  const principalName = await ask('What should your CEO Agent call you?');
  const businessContext = await ask('Briefly describe your business or role');
  const operatingRhythm = await ask(
    'When are you typically available for decisions? (e.g. "9am-6pm EST, mobile after hours")',
    'Not specified'
  );

  console.log('');
  console.log('Which departments should be active? (Executive is always active.)');
  const activeDepartments = ['executive'];
  for (const dept of ALL_DEPARTMENTS) {
    const enabled = await askYesNo(`  Activate ${dept.label}?`, true);
    if (enabled) activeDepartments.push(dept.id);
  }

  console.log('');
  console.log('Cost mode — flagship uses the best available model for every response');
  console.log('(higher quality, higher cost). Efficient uses a smaller/cheaper model');
  console.log('(lower cost, may be less capable). You can change this anytime with /cost.');
  const useFlagship = await askYesNo('Use flagship (highest quality) by default?', true);
  const costMode = useFlagship ? 'flagship' : 'efficient';

  console.log('');
  console.log('Model provider setup — CEO Agent routes tasks via OpenRouter by default.');
  const hasKey = await askYesNo('Do you have an OpenRouter API key ready to add now?', false);
  let openRouterKey = '';
  if (hasKey) {
    openRouterKey = await askSecret('Paste your OpenRouter API key (input will not be shown back)');
  } else {
    console.log('  Skipping — you can add OPENROUTER_API_KEY to .env later.');
  }

  const config = {
    agentName,
    principalName,
    businessContext,
    operatingRhythm,
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
        fs.writeFileSync(
          ENV_PATH,
          existing.replace(/OPENROUTER_API_KEY=.*/g, envLine.trim()),
          'utf8'
        );
      } else {
        fs.appendFileSync(ENV_PATH, envLine, 'utf8');
      }
    } else {
      fs.writeFileSync(ENV_PATH, envLine, 'utf8');
    }
    console.log('');
    console.log('  Saved to .env (not committed to git).');
  }

  console.log('');
  console.log('=========================================');
  console.log(`  ${agentName} is configured.`);
  console.log(`  Active departments: ${activeDepartments.join(', ')}`);
  console.log(`  Cost mode: ${costMode}`);
  console.log('=========================================');
  console.log('');

  rl.close();

  require('./chat.js');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  rl.close();
  process.exit(1);
});

// CEO Agent slash registry
// Shared list for CLI boot, /help, and later the web composer.
// Hermes-inspired names only where they map to this product.

const COMMANDS = [
  { name: '/help',          boot: true,  status: 'live',    help: 'Show commands' },
  { name: '/org',           boot: true,  status: 'live',    help: 'Active org chart' },
  { name: '/status',        boot: true,  status: 'live',    help: 'Runtime + agent status' },
  { name: '/models',        boot: true,  status: 'live',    help: 'Resolved model assignments' },
  { name: '/cost',          boot: true,  status: 'live',    help: 'Show or set cost mode' },
  { name: '/mode',          boot: true,  status: 'live',    help: 'Show or set CEO mode' },
  { name: '/skills',        boot: true,  status: 'live',    help: 'Registered skills' },
  { name: '/attach',        boot: true,  status: 'live',    help: 'Attach a file to the next message' },
  { name: '/departments',   boot: true,  status: 'live',    help: 'Active departments' },
  { name: '/who',           boot: true,  status: 'live',    help: 'Who reports to whom' },
  { name: '/health',        boot: true,  status: 'live',    help: 'Health snapshot' },
  { name: '/activity',      boot: true,  status: 'stub',    help: 'Recent routed work' },
  { name: '/usage',         boot: true,  status: 'stub',    help: 'Token usage this session' },
  { name: '/config',        boot: true,  status: 'live',    help: 'Current config (no secrets)' },
  { name: '/clear',         boot: true,  status: 'live',    help: 'Clear the screen' },
  { name: '/new',           boot: true,  status: 'live',    help: 'Start a clean turn (drop pending attachments)' },
  { name: '/history',       boot: true,  status: 'stub',    help: 'Session history' },
  { name: '/save',          boot: true,  status: 'stub',    help: 'Save session notes' },
  { name: '/reload',        boot: true,  status: 'stub',    help: 'Reload runtime from disk' },
  { name: '/exit',          boot: true,  status: 'live',    help: 'Quit' },

  // Extra — in /help, not on the boot strip
  { name: '/quit',          boot: false, status: 'live',    help: 'Quit (alias of /exit)' },
  { name: '/agents',        boot: false, status: 'live',    help: 'Alias of /org' },
  { name: '/connections',   boot: false, status: 'stub',    help: 'Provider connections' },
  { name: '/stop',          boot: false, status: 'stub',    help: 'Stop in-flight work' },
  { name: '/verbose',       boot: false, status: 'stub',    help: 'Toggle verbose routing logs' },
];

function bootCommands() {
  return COMMANDS.filter(c => c.boot).slice(0, 20);
}

function findCommand(input) {
  const name = String(input || '').split(/\s+/)[0].toLowerCase();
  return COMMANDS.find(c => c.name === name) || null;
}

module.exports = { COMMANDS, bootCommands, findCommand };

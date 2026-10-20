#!/usr/bin/env node
// Custom dev server wrapper that handles PORT collision gracefully.
// Behavior:
// - Explicit CLI --port or -p wins
// - Else PORT env var wins
// - Else default 3000
// - If chosen port is busy, scan for next free port and use it
// - Always binds to 127.0.0.1 (localhost only)
// - Prints the actual port being used

const { spawn } = require('node:child_process');
const net = require('node:net');

function parseArgs() {
  const args = process.argv.slice(2);
  let port = null;
  let hostname = '127.0.0.1';
  const nextArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' || arg === '--port') {
      port = parseInt(args[++i], 10);
    } else if (arg.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-H' || arg === '--hostname') {
      hostname = args[++i];
    } else if (arg.startsWith('--hostname=')) {
      hostname = arg.split('=')[1];
    } else {
      nextArgs.push(arg);
    }
  }

  // Fallback to env var
  if (port === null && process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
  }
  // Default
  if (port === null) {
    port = 3000;
  }

  return { port, hostname, nextArgs };
}

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findFreePort(startPort, host) {
  let port = startPort;
  while (port < startPort + 100) { // reasonable upper bound
    if (await isPortFree(port, host)) {
      return port;
    }
    port++;
  }
  throw new Error(`Could not find free port in range ${startPort}-${startPort + 99}`);
}

async function main() {
  const { port: desiredPort, hostname, nextArgs } = parseArgs();

  const actualPort = await findFreePort(desiredPort, hostname);

  if (actualPort !== desiredPort) {
    console.log(`Port ${desiredPort} in use, using next free port: ${actualPort}`);
  } else {
    console.log(`Starting on http://${hostname}:${actualPort}`);
  }

  // Pass the resolved port to next dev
  const child = spawn('npx', ['next', 'dev', '-H', hostname, '-p', String(actualPort), ...nextArgs], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(actualPort) },
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals
  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, () => child.kill(sig));
  });
}

main().catch((err) => {
  console.error('Failed to start dev server:', err.message);
  process.exit(1);
});
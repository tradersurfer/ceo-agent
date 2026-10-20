// Test for dev-server.js PORT collision handling
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');

const DEV_SERVER = path.resolve(__dirname, '../scripts/dev-server.js');

function findFreePort(startPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(findFreePort(startPort + 1)));
    server.once('listening', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.listen(startPort, '127.0.0.1');
  });
}

test('dev-server: respects explicit --port argument', async () => {
  const port = await findFreePort(4000);
  const child = spawn('node', [DEV_SERVER, '--port', String(port)], { stdio: 'pipe' });
  let output = '';
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);

  await new Promise(r => setTimeout(r, 2000));
  child.kill();

  assert.match(output, new RegExp(`Starting on http://127\\.0\\.0\\.1:${port}`));
});

test('dev-server: falls back to PORT env var', async () => {
  const port = await findFreePort(4100);
  const child = spawn('node', [DEV_SERVER], {
    stdio: 'pipe',
    env: { ...process.env, PORT: String(port) }
  });
  let output = '';
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);

  await new Promise(r => setTimeout(r, 2000));
  child.kill();

  assert.match(output, new RegExp(`Starting on http://127\\.0\\.0\\.1:${port}`));
});

test('dev-server: picks next free port when desired port is busy', async () => {
  const busyPort = await findFreePort(4200);
  // Hold the port
  const holder = net.createServer();
  await new Promise((resolve) => holder.listen(busyPort, '127.0.0.1', resolve));

  try {
    const child = spawn('node', [DEV_SERVER, '--port', String(busyPort)], { stdio: 'pipe' });
    let output = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);

    await new Promise(r => setTimeout(r, 2000));
    child.kill();

    // Should have picked a different port
    assert.match(output, /Port \d+ in use, using next free port: \d+/);
    assert.ok(!output.includes(`Starting on http://127.0.0.1:${busyPort}`));
  } finally {
    holder.close();
  }
});

test('dev-server: defaults to 3000 when no port specified', async () => {
  const port = await findFreePort(3000);
  // If 3000 is free, it should use it
  const child = spawn('node', [DEV_SERVER], { stdio: 'pipe' });
  let output = '';
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);

  await new Promise(r => setTimeout(r, 2000));
  child.kill();

  if (port === 3000) {
    assert.match(output, /Starting on http:\/\/127\.0\.0\.1:3000/);
  } else {
    // 3000 was busy, should have picked next free
    assert.match(output, /Port 3000 in use, using next free port: \d+/);
  }
});
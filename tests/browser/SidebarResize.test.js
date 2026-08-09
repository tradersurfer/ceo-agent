/**
 * Real-browser drag-to-resize test for the sidebar (#110), building on the
 * collapse/expand toggle from #107. jsdom's fireEvent.keyDown coverage in
 * tests/components/Sidebar.test.jsx proves the width state/clamping logic;
 * it cannot exercise a real mouse-drag gesture (pointerdown -> pointermove
 * -> pointerup against real getBoundingClientRect() layout), so this test
 * drives an actual browser the same way tests/browser/ChatInputResponsive.
 * test.js already does.
 *
 * Boots `next dev` on a dedicated port, drives it with Playwright, and
 * tears both down afterward. Writes a temporary, gitignored
 * ceo-agent.config.json so /api/config reports configured:true and the
 * real chat UI renders -- and restores whatever was there before.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3998;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');

let serverProcess;
let browser;
let previousConfig;

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, res => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

test.before(async () => {
  previousConfig = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : undefined;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    agentName: 'CEO Agent',
    principalName: 'Test Principal',
    businessContext: 'a sidebar-resize test',
    activeDepartments: ['executive', 'finance', 'operations', 'technology', 'marketing', 'people', 'legal'],
    costMode: 'flagship',
    createdAt: new Date().toISOString(),
  }, null, 2));

  // Spawned via the npm script (shell:true) rather than exec'ing
  // node_modules/.bin/next directly: that file is a POSIX shell script on
  // this install, which process.execPath cannot run on Windows -- the same
  // pattern tests/browser/ChatInputResponsive.test.js uses fails for that
  // reason on a Windows host. `npm run web -- -p <port>` resolves through
  // the platform's own shell (cmd.exe/.cmd shim on Windows, sh elsewhere),
  // same as every other npm invocation in this project's tooling.
  serverProcess = spawn(
    'npm',
    ['run', 'web', '--', '-p', String(PORT)],
    { cwd: ROOT, stdio: 'ignore', shell: true },
  );
  await waitForServer(BASE_URL, 45000);
  const sandboxChromium = '/opt/pw-browsers/chromium';
  browser = await chromium.launch(
    fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  );
});

test.after(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
  if (previousConfig === undefined) {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  } else {
    fs.writeFileSync(CONFIG_PATH, previousConfig);
  }
});

test('dragging the sidebar edge resizes it within the real DOM, growing .content to compensate', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar-resize-handle', { timeout: 15000 });

    const before = await page.locator('.sidebar').boundingBox();
    assert.ok(before, 'sidebar should be visible before dragging');
    assert.ok(Math.abs(before.width - 180) < 1, `expected the 180px default before any drag, got ${before.width}`);

    const handle = page.locator('.sidebar-resize-handle');
    const handleBox = await handle.boundingBox();
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY, { steps: 10 });
    await page.mouse.up();

    const after = await page.locator('.sidebar').boundingBox();
    assert.ok(
      Math.abs(after.width - 260) < 2,
      `expected the sidebar to grow to ~260px (180 + 80px drag), got ${after.width}`,
    );

    const content = await page.locator('.content').boundingBox();
    assert.ok(
      content.x >= after.x + after.width - 1,
      'content should start right where the resized sidebar ends, not overlap it',
    );
  } finally {
    await page.close();
  }
});

test('dragging past the minimum floor clamps at 140px and does NOT trigger the collapsed rail', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar-resize-handle', { timeout: 15000 });

    const handle = page.locator('.sidebar-resize-handle');
    const handleBox = await handle.boundingBox();
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Drag far past the floor (180 -> attempted -300, well under the 140px min).
    await page.mouse.move(startX - 500, startY, { steps: 10 });
    await page.mouse.up();

    const after = await page.locator('.sidebar').boundingBox();
    assert.ok(Math.abs(after.width - 140) < 2, `expected the width to clamp at 140px, got ${after.width}`);

    const collapsed = await page.evaluate(() => document.querySelector('.sidebar').classList.contains('sidebar-collapsed'));
    assert.equal(collapsed, false, 'dragging to the floor must not itself flip the sidebar into the collapsed (56px rail) state');
  } finally {
    await page.close();
  }
});

test('drag-resize and the #107 collapse toggle do not fight: collapsing after a drag hides the handle, expanding restores the dragged width', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar-resize-handle', { timeout: 15000 });

    const handle = page.locator('.sidebar-resize-handle');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 40, handleBox.y + handleBox.height / 2, { steps: 10 });
    await page.mouse.up();
    const dragged = await page.locator('.sidebar').boundingBox();

    await page.getByLabel('Collapse sidebar').click();
    await page.waitForSelector('.sidebar-collapsed', { timeout: 5000 });
    assert.equal(await page.locator('.sidebar-resize-handle').count(), 0, 'no resize handle should render on the collapsed rail');
    // .sidebar's width change is CSS-transitioned (app/globals.css: 0.15s
    // ease) -- wait for it to settle before measuring, same as
    // ChatInputResponsive.test.js's own waitForTimeout precedent for a
    // layout that isn't instantaneous.
    await page.waitForTimeout(250);
    const collapsedBox = await page.locator('.sidebar').boundingBox();
    assert.ok(Math.abs(collapsedBox.width - 56) < 2, `collapsed rail should be the fixed 56px width, got ${collapsedBox.width}`);

    await page.getByLabel('Expand sidebar').click();
    await page.waitForTimeout(250);
    const reExpanded = await page.locator('.sidebar').boundingBox();
    assert.ok(
      Math.abs(reExpanded.width - dragged.width) < 2,
      `expanding again should restore the previously-dragged width (~${dragged.width}px), got ${reExpanded.width}`,
    );
  } finally {
    await page.close();
  }
});

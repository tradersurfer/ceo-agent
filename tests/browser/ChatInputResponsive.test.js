/**
 * Real-browser layout test for the chat input row's mobile responsiveness
 * (the narrow-viewport chip-crush bug). jsdom cannot exercise this: it
 * doesn't implement CSS layout at all (every element reports 0 width/
 * height unless manually mocked), so a real assertion about a real
 * computed width at a real viewport needs a real browser and a real
 * running server -- this is the first test in the suite to use either.
 *
 * Boots `next dev` on a dedicated port, drives it with Playwright, and
 * tears both down afterward. Writes a temporary, gitignored
 * ceo-agent.config.json (same as every manual boot-check in this
 * project's history) so /api/config reports configured:true and the real
 * chat UI renders instead of the empty "no CEO Agent found" state -- and
 * restores whatever was there before, so this never clobbers a real local
 * install's config.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3999;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONFIG_PATH = path.join(ROOT, 'ceo-agent.config.json');

let serverProcess;
let browser;
let previousConfig; // undefined = didn't exist before; string = existing content to restore

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
    businessContext: 'a responsive-layout test',
    activeDepartments: ['executive', 'finance', 'operations', 'technology', 'marketing', 'people', 'legal'],
    costMode: 'flagship',
    createdAt: new Date().toISOString(),
  }, null, 2));

  serverProcess = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', '.bin', 'next'), 'dev', '-H', '127.0.0.1', '-p', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' },
  );
  await waitForServer(BASE_URL, 45000);
  // Some sandboxed dev environments pre-install Chromium outside
  // Playwright's own managed browser cache (and skip `playwright install`
  // entirely via PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) at this fixed path.
  // Fall back to Playwright's own resolution (a real `playwright install
  // chromium` having been run, e.g. in CI) when it's not present.
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

test('narrow iPhone-class viewport (390px): toggle chips move below the input, textarea keeps a usable width', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('textarea.chat-textarea', { timeout: 15000 });

    const textareaBox = await page.locator('textarea.chat-textarea').boundingBox();
    const togglesBox = await page.locator('.chat-input-toggles').boundingBox();

    assert.ok(textareaBox, 'textarea should be visible and have a bounding box');
    assert.ok(
      textareaBox.width >= 140,
      `textarea width should stay at or above its sane 140px floor at a narrow viewport, got ${textareaBox.width}`,
    );

    assert.ok(togglesBox, '.chat-input-toggles should be visible and have a bounding box');
    assert.ok(
      togglesBox.y >= textareaBox.y + textareaBox.height - 4,
      `toggle chips must sit on their own row below the input row at a narrow viewport, not share it ` +
      `(textarea top=${textareaBox.y} height=${textareaBox.height}, toggles top=${togglesBox.y})`,
    );
  } finally {
    await page.close();
  }
});

test('desktop viewport (1280px): layout is unchanged -- toggle chips still sit beside the input on one row', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('textarea.chat-textarea', { timeout: 15000 });

    const textareaBox = await page.locator('textarea.chat-textarea').boundingBox();
    const togglesBox = await page.locator('.chat-input-toggles').boundingBox();

    assert.ok(
      Math.abs(togglesBox.y - textareaBox.y) < 40,
      `at desktop width the toggle chips should sit roughly on the same row as the textarea, not stack below it ` +
      `(textarea top=${textareaBox.y}, toggles top=${togglesBox.y})`,
    );
  } finally {
    await page.close();
  }
});

// --- Sidebar collapse (extends this PR's scope: the chip-crush fix alone
// wasn't enough at real iPhone-class widths -- the sidebar's fixed 180px
// width was consuming over half a 390px viewport before the chat input
// row even got a chance. See the CSS comment on .sidebar-collapsed for
// the exact math behind the 56px rail width. ------------------------

test('narrow iPhone-class viewport (390px): sidebar is collapsed to an icon rail by default', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar', { timeout: 15000 });

    const collapsed = await page.evaluate(() => document.querySelector('.sidebar').classList.contains('sidebar-collapsed'));
    assert.ok(collapsed, 'sidebar should default to collapsed below the mobile breakpoint');
  } finally {
    await page.close();
  }
});

test('desktop viewport (1280px): sidebar is expanded by default, unchanged from before the collapse feature', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sidebar', { timeout: 15000 });

    const collapsed = await page.evaluate(() => document.querySelector('.sidebar').classList.contains('sidebar-collapsed'));
    assert.equal(collapsed, false, 'sidebar should default to expanded at desktop width');
  } finally {
    await page.close();
  }
});

test('narrow iPhone-class viewport (390px), sidebar collapsed: zero elements in the chat input row overflow the viewport', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('textarea.chat-textarea', { timeout: 15000 });
    await page.waitForTimeout(300);

    const report = await page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowing = Array.from(document.querySelectorAll('.chat-input-row, .chat-input-row *'))
        .filter(el => el.getBoundingClientRect().width > 0)
        .filter(el => el.getBoundingClientRect().right > vw + 0.5)
        .map(el => ({ cls: el.className, right: el.getBoundingClientRect().right }));
      return { overflowing, sidebarCollapsed: document.querySelector('.sidebar').classList.contains('sidebar-collapsed') };
    });

    assert.ok(report.sidebarCollapsed, 'precondition: sidebar must actually be collapsed for this check to mean anything');
    assert.deepEqual(
      report.overflowing,
      [],
      `expected zero overflowing elements in the chat input row at 390px, found: ${JSON.stringify(report.overflowing)}`,
    );
  } finally {
    await page.close();
  }
});

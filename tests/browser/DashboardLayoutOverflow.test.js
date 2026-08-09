/**
 * Real-browser layout tests for two dashboard surfaces that had zero
 * real-browser coverage before this (Tier 1 Part 10, docs/ROADMAP-
 * MASTER.md): StatusView's 3-column CSS Grid (.status-cards) and OrgView's
 * auto-fill CSS Grid (.org-grid). jsdom cannot exercise either -- it has no
 * layout engine at all, so `grid-template-columns: repeat(...)` and
 * `minmax()`/`auto-fill` resolution (how many real columns render, whether
 * anything actually overflows the viewport) can only be verified against a
 * real browser. This project has real, shipped history of exactly this
 * category of bug reaching production undetected by jsdom-only tests (the
 * chat-input-row and sidebar-width overflow bugs fixed earlier in this
 * project) -- this is the same regression class, checked for these two
 * surfaces before either one has actually broken, not after.
 *
 * Same boot/teardown pattern as tests/browser/SidebarResize.test.js
 * (portable `npm run web` spawn via shell:true -- exec'ing
 * node_modules/.bin/next directly fails on Windows, since that file is a
 * POSIX shell script there).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { killServerTree } = require('./_killServerTree');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3997;
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
    businessContext: 'a dashboard-layout test',
    activeDepartments: ['executive', 'finance', 'operations', 'technology', 'marketing', 'people', 'legal'],
    costMode: 'flagship',
    createdAt: new Date().toISOString(),
  }, null, 2));

  serverProcess = spawn('npm', ['run', 'web', '--', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore', shell: true });
  await waitForServer(BASE_URL, 45000);
  const sandboxChromium = '/opt/pw-browsers/chromium';
  browser = await chromium.launch(fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});
});

test.after(async () => {
  await browser?.close();
  if (serverProcess) killServerTree(serverProcess);
  if (previousConfig === undefined) {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  } else {
    fs.writeFileSync(CONFIG_PATH, previousConfig);
  }
});

/**
 * Clicks a sidebar nav item and waits for the target selector to appear,
 * retrying the click a few times. `networkidle` guarantees the network is
 * idle, NOT that React has finished hydrating and attached this button's
 * click handler -- a server-rendered button is visible/enabled (so
 * Playwright's own auto-waiting click() considers it actionable) before
 * hydration wires up its onClick, so a click issued right after
 * `networkidle` can be a silent no-op under load. Retrying the click
 * itself (not just waiting longer) is the robust fix for this class of
 * flake, not a longer single timeout.
 */
async function clickNavAndWait(page, label, targetSelector, { attempts = 5, perAttemptMs = 4000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.getByLabel(label).click();
    try {
      await page.waitForSelector(targetSelector, { timeout: perAttemptMs });
      return;
    } catch {
      if (attempt === attempts) throw new Error(`"${targetSelector}" never appeared after ${attempts} click attempts on "${label}"`);
    }
  }
}

async function findOverflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll('.content, .content *'))
      .filter(el => el.getBoundingClientRect().width > 0)
      .filter(el => el.getBoundingClientRect().right > vw + 0.5)
      .map(el => ({ cls: el.className, right: el.getBoundingClientRect().right }));
  });
}

test('StatusView (.status-cards, 3-column grid): zero overflow at a narrow iPhone-class viewport (390px)', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await clickNavAndWait(page, 'Status', '.status-cards');
    await page.waitForTimeout(300);

    const cards = await page.locator('.status-card').all();
    assert.equal(cards.length, 3, 'expected exactly 3 status cards');

    const overflow = await findOverflow(page);
    assert.deepEqual(overflow, [], `expected zero overflowing elements in StatusView at 390px, found: ${JSON.stringify(overflow)}`);
  } finally {
    await page.close();
  }
});

test('StatusView (.status-cards): all 3 cards render as real, roughly-equal-width, non-overlapping columns at desktop width', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await clickNavAndWait(page, 'Status', '.status-cards');

    const boxes = await page.locator('.status-card').evaluateAll(
      els => els.map(el => el.getBoundingClientRect()).map(r => ({ left: r.left, right: r.right, width: r.width })),
    );
    assert.equal(boxes.length, 3);
    // Real grid columns: each card starts to the right of where the
    // previous one ended (no overlap), and widths are close to equal
    // (repeat(3, minmax(0, 1fr)) -- not a coincidence a real grid engine
    // would produce if this collapsed to a single stacked column instead).
    assert.ok(boxes[1].left >= boxes[0].right - 1, 'card 2 must not overlap card 1');
    assert.ok(boxes[2].left >= boxes[1].right - 1, 'card 3 must not overlap card 2');
    const widths = boxes.map(b => b.width);
    const maxDelta = Math.max(...widths) - Math.min(...widths);
    assert.ok(maxDelta < 5, `expected roughly equal column widths, got ${JSON.stringify(widths)}`);
  } finally {
    await page.close();
  }
});

test('OrgView (.org-grid, auto-fill minmax(200px,1fr)): zero overflow at a narrow iPhone-class viewport (390px)', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await clickNavAndWait(page, 'Org chart', '.org-grid');
    await page.waitForTimeout(300);

    const overflow = await findOverflow(page);
    assert.deepEqual(overflow, [], `expected zero overflowing elements in OrgView at 390px, found: ${JSON.stringify(overflow)}`);

    // At 390px (minus the collapsed 56px sidebar rail and .content's 48px
    // padding), there's only room for a single 200px-min column -- confirm
    // auto-fill actually collapsed to one column rather than rendering
    // narrower-than-200px cards that would themselves overflow.
    const cardWidths = await page.locator('.org-card').evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
    for (const width of cardWidths) {
      assert.ok(width >= 199, `expected every org-card to respect its 200px grid minimum even at a narrow viewport, got ${width}`);
    }
  } finally {
    await page.close();
  }
});

test('OrgView (.org-grid): renders multiple real columns at desktop width, not a single stacked column', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await clickNavAndWait(page, 'Org chart', '.org-grid');

    const tops = await page.locator('.org-card').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().top)));
    const distinctRowTops = new Set(tops);
    // Seven departments at 200px-min columns comfortably fit more than one
    // per row at 1280px -- if auto-fill were somehow not resolving (e.g. a
    // future CSS regression collapsing this to display:block), every card
    // would report a distinct top (one per row) instead.
    assert.ok(distinctRowTops.size < tops.length, `expected multiple cards sharing a row at desktop width, got one row per card: ${JSON.stringify(tops)}`);
  } finally {
    await page.close();
  }
});

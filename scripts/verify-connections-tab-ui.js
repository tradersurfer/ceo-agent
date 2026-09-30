#!/usr/bin/env node
/**
 * Real-browser check of the Connections tab's key validation, driving the
 * actual Next.js dev server with Playwright (already a devDependency).
 *
 * Verifies what jsdom component tests cannot: that a user typing junk into
 * the OpenRouter card sees a real, specific error and that the field is not
 * cleared, in a real rendered page.
 *
 * Assumes the dev server is already running on the given port.
 * Run: node scripts/verify-connections-tab-ui.js [port]
 */

const { chromium } = require('playwright');

const PORT = process.argv[2] || '3111';
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

async function openCard(page, label) {
  // Match the card's own header NAME specifically. Matching on bare
  // "Anthropic" also hits other cards (the role/tier chips and hint copy
  // mention provider names), so anchor to the name element in the header
  // and take its closest card.
  const card = page
    .locator('.connection-card')
    .filter({ has: page.locator('.connection-card-name', { hasText: new RegExp(`^${label}$`) }) })
    .first();
  return card;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  // Store the whole message object, not just its text — the filter below
  // needs `location().url` to tell a 404 on logo-mark.png apart from any
  // other 404, since the text alone never names the resource.
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg); });
  page.on('pageerror', err => consoleErrors.push({ text: String(err), location: { url: '(pageerror)' } }));

  try {
    // 'domcontentloaded', not 'networkidle': the Next dev server keeps an
    // HMR websocket open, so the network never goes idle and a
    // networkidle wait would always time out.
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.connection-card, .sidebar, body', { timeout: 30000 });

    // Connections is a top-level sidebar nav item (Sidebar.tsx's NAV list),
    // not a settings sub-tab — click the nav control itself.
    const connectionsNav = page.locator('button', { hasText: /^Connections$/i }).first();
    if (await connectionsNav.count()) {
      await connectionsNav.click();
    } else {
      await page.getByText('🔌').first().click();
    }
    await page.waitForSelector('.connection-card', { timeout: 30000 });

    const cardCount = await page.locator('.connection-card').count();
    const cardNames = await page.locator('.connection-card-name').allInnerTexts();
    // Provider count comes from lib/providers.js (5 today: openrouter,
    // anthropic, openai, google, xai). Assert the actual provider list is
    // rendered rather than a hardcoded 5, so adding a provider upstream
    // doesn't produce a confusing failure here.
    const expectedNames = ['OpenRouter', 'Anthropic', 'OpenAI', 'Google AI Studio', 'xAI'];
    const namesOk = expectedNames.every(n => cardNames.includes(n));
    report(namesOk, 'every provider renders a card', `rendered: ${JSON.stringify(cardNames)}`);

    // --- Typing junk into OpenRouter must produce a visible error. ---
    const openRouter = await openCard(page, 'OpenRouter');
    await openRouter.locator('input[type="password"]').fill('hello');
    await openRouter.getByRole('button', { name: /save key/i }).click();

    await page.waitForSelector('[data-testid="connection-error-openrouter"]', { timeout: 20000 });
    const errText = await page.locator('[data-testid="connection-error-openrouter"]').innerText();
    report(/too short|does not look like|rejected/i.test(errText),
      'junk key shows a specific error', errText.trim().slice(0, 90));

    // The field must keep the text so the user can fix it.
    const stillThere = await openRouter.locator('input[type="password"]').inputValue();
    report(stillThere === 'hello', 'a rejected key stays in the field for correction', `value=${JSON.stringify(stillThere)}`);

    // --- A shape-valid fake must be rejected by the live provider call. ---
    await openRouter.locator('input[type="password"]').fill('sk-or-v1-' + '0'.repeat(64) + '-' + '0'.repeat(64));
    await openRouter.getByRole('button', { name: /save key/i }).click();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="connection-error-openrouter"]');
        return el && /rejected/i.test(el.textContent);
      },
      { timeout: 30000 }
    );
    const fakeErr = await page.locator('[data-testid="connection-error-openrouter"]').innerText();
    report(/rejected/i.test(fakeErr), 'a well-formed fake key is rejected live', fakeErr.trim().slice(0, 90));

    // --- Wrong-card paste. ---
    const anthropic = await openCard(page, 'Anthropic');
    await anthropic.locator('input[type="password"]').fill('sk-or-v1-' + '1'.repeat(64) + '-' + '1'.repeat(64));
    await anthropic.getByRole('button', { name: /save key/i }).click();
    await page.waitForSelector('[data-testid="connection-error-anthropic"]', { timeout: 20000 });
    const wrongErr = await page.locator('[data-testid="connection-error-anthropic"]').innerText();
    report(/Paste it in the OpenRouter field instead/i.test(wrongErr),
      'a wrong-provider paste points to the right field', wrongErr.trim().slice(0, 90));

    // Only React-level failures count. Two things are excluded, both
    // expected and unrelated to validation:
    //  - 400 responses on /api/config: these ARE the rejections under test,
    //    so the browser logs them as failed resource loads by design.
    //  - 404 on logo-mark.png: a pre-existing missing asset in this repo.
    // pageerror (uncaught exceptions) is still always fatal.
    //
    // Matched against the message's `location().url` rather than its text:
    // the text is just "Failed to load resource: the server responded with
    // a status of 404 (Not Found)" and does NOT name the file, so matching
    // on the text would never exclude the logo request.
    const unexpected = consoleErrors.filter(entry => {
      const url = (entry.location && entry.location.url) || '';
      if (/status of 400/.test(entry.text) && url.includes('/api/config')) return false;
      if (url.includes('logo-mark.png')) return false;
      return true;
    });
    report(unexpected.length === 0, 'no unexpected console/page errors',
      unexpected.slice(0, 3).map(e => e.text).join(' | ') || 'clean');
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? 'Connections tab UI verified in a real browser.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('UI verification crashed:', err.message);
  process.exit(1);
});

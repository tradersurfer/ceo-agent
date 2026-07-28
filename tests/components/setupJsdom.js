/**
 * Minimal jsdom global environment for @testing-library/react under
 * `node --test` (no jest, no browser). Loaded via `node --require` before
 * the test files, so `document`/`window` exist by the time React/RTL
 * modules are required.
 */

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Copy the rest of jsdom's window surface onto the Node global object
// (Element, Node, CustomEvent, MutationObserver, etc.) — the same minimal
// bridge react-dom/testing-library expect when there's no real browser.
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  try {
    global[key] = dom.window[key];
  } catch {
    // Some window properties (e.g. window.length) are getter-only and
    // throw on copy — harmless to skip, nothing downstream needs them.
  }
}

global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.cancelAnimationFrame = id => clearTimeout(id);

// jsdom doesn't implement scrollIntoView — no-op polyfill so components that
// autoscroll (e.g. ChatView's message list) don't throw under this harness.
if (!dom.window.Element.prototype.scrollIntoView) {
  dom.window.Element.prototype.scrollIntoView = () => {};
}

// Tells React 18 it's safe to batch/flush synchronously inside act()
// without the "not wrapped in act" warning path meant for real browsers.
global.IS_REACT_ACT_ENVIRONMENT = true;

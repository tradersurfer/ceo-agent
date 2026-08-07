const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, fireEvent } = require('@testing-library/react');
const Sidebar = require('../../app/components/Sidebar').default;

afterEach(() => {
  cleanup();
});

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function renderSidebar(props = {}) {
  return render(
    React.createElement(Sidebar, {
      agentName: 'CEO Agent',
      tab: 'chat',
      onSelect: () => {},
      ...props,
    })
  );
}

test('at a desktop-width viewport (>=640px), the sidebar is expanded by default: agent name and full nav labels are visible', () => {
  setViewportWidth(1024);
  renderSidebar();

  assert.ok(screen.getByText('CEO Agent'));
  assert.ok(screen.getByText('Chat'));
  assert.ok(screen.getByText('Settings'));
  assert.equal(document.querySelector('.sidebar-collapsed'), null);
});

test('at a narrow mobile viewport (390px), the sidebar is collapsed by default: agent name and nav labels are hidden, only icons remain', () => {
  setViewportWidth(390);
  renderSidebar();

  assert.throws(() => screen.getByText('CEO Agent'), 'agent name should not render in the collapsed rail');
  assert.throws(() => screen.getByText('Chat'), 'nav item text labels should not render in the collapsed rail');
  assert.ok(document.querySelector('.sidebar-collapsed'), 'sidebar should carry the collapsed class');
  // Every nav item must still be a real, labeled tap target -- collapsed
  // means icon-only, not unreachable.
  assert.ok(screen.getByLabelText('Chat'));
  assert.ok(screen.getByLabelText('Settings'));
});

test('every nav item stays clickable and fires onSelect while collapsed', () => {
  setViewportWidth(390);
  let selected = null;
  renderSidebar({ onSelect: id => { selected = id; } });

  fireEvent.click(screen.getByLabelText('Org chart'));
  assert.equal(selected, 'org');
});

test('manually collapsing at desktop width sticks -- a later resize back to desktop width does not re-expand it', () => {
  setViewportWidth(1024);
  renderSidebar();

  fireEvent.click(screen.getByLabelText('Collapse sidebar'));
  assert.ok(document.querySelector('.sidebar-collapsed'));

  // Simulate the window actually resizing (still desktop-wide) -- the
  // pre-existing responsive-default effect would, if it weren't gated on
  // the user-toggled flag, snap this back to expanded because 1024px is
  // above the mobile breakpoint. It must not.
  setViewportWidth(1100);
  fireEvent(window, new window.Event('resize'));

  assert.ok(document.querySelector('.sidebar-collapsed'), 'a manual collapse must survive a subsequent resize');
});

test('manually expanding at mobile width sticks -- a later resize stays at mobile width does not re-collapse it', () => {
  setViewportWidth(390);
  renderSidebar();
  assert.ok(document.querySelector('.sidebar-collapsed'));

  fireEvent.click(screen.getByLabelText('Expand sidebar'));
  assert.equal(document.querySelector('.sidebar-collapsed'), null);

  // Still a narrow viewport -- the responsive default alone would want
  // this collapsed. The user's explicit choice to expand must win.
  setViewportWidth(375);
  fireEvent(window, new window.Event('resize'));

  assert.equal(document.querySelector('.sidebar-collapsed'), null, 'a manual expand must survive a subsequent resize at mobile width');
});

test('before any manual toggle, resizing across the breakpoint still re-derives the responsive default', () => {
  setViewportWidth(1024);
  renderSidebar();
  assert.equal(document.querySelector('.sidebar-collapsed'), null);

  setViewportWidth(390);
  fireEvent(window, new window.Event('resize'));

  assert.ok(document.querySelector('.sidebar-collapsed'), 'without a manual toggle yet, the sidebar should still track the responsive default on resize');
});

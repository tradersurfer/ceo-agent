#!/usr/bin/env node
// CEO Agent — shared CLI theme (Executive Command)
// No extra dependencies. Respects NO_COLOR, TERM=dumb, and non-TTY.

const colorEnabled =
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  !!(process.stdout && process.stdout.isTTY);

function paint(code, text) {
  if (!colorEnabled) return String(text);
  return `\x1b[${code}m${text}\x1b[0m`;
}

const theme = {
  enabled: colorEnabled,
  bold: text => paint(1, text),
  dim: text => paint(2, text),
  accent: text => paint('38;5;141', text),
  accentSoft: text => paint('38;5;183', text),
  cyan: text => paint('38;5;81', text),
  gold: text => paint('38;5;179', text),
  success: text => paint('38;5;42', text),
  danger: text => paint('38;5;203', text),
  warn: text => paint('38;5;214', text),
  muted: text => paint('38;5;245', text),
  text: text => paint('38;5;255', text),
};

const W = 59;

function visibleWidth(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padVisible(s, n) {
  const str = String(s);
  const len = visibleWidth(str);
  if (len >= n) return str;
  const left = Math.floor((n - len) / 2);
  return ' '.repeat(left) + str + ' '.repeat(n - len - left);
}

// Hard-slicing a description mid-word ("Show or set c") reads as broken, not terse.
// Clip at the last space inside the budget and mark the cut so a reader can tell
// "shorter help" from "whole help".
function clipVisible(text, max) {
  const str = String(text || '');
  if (visibleWidth(str) <= max) return str;
  const hard = str.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(' ');
  const body = (lastSpace > max * 0.5 ? hard.slice(0, lastSpace) : hard).trimEnd();
  return body + '…';
}

function rule(char = '─') {
  return theme.accent(char.repeat(W));
}

function banner(agentName, principalName) {
  const title = String(agentName || 'CEO Agent');
  const reports = `reports to  ${principalName || 'you'}`;
  const inner = W - 2;

  return [
    '',
    theme.accent('╔' + '═'.repeat(inner) + '╗'),
    theme.accent('║') + padVisible('', inner) + theme.accent('║'),
    theme.accent('║') + theme.bold(theme.accentSoft(padVisible(title.toUpperCase(), inner))) + theme.accent('║'),
    theme.accent('║') + theme.muted(padVisible('the ai that runs your ai workforce', inner)) + theme.accent('║'),
    theme.accent('║') + theme.muted(padVisible(reports, inner)) + theme.accent('║'),
    theme.accent('║') + padVisible('', inner) + theme.accent('║'),
    theme.accent('╚' + '═'.repeat(inner) + '╝'),
  ].join('\n');
}

function kv(label, value) {
  return `  ${theme.muted(String(label).padEnd(16))} ${theme.text(value == null || value === '' ? '—' : value)}`;
}

function statusBlock(config, extras = {}) {
  const depts = Array.isArray(config.activeDepartments)
    ? config.activeDepartments.join(' · ')
    : String(config.activeDepartments || '—');

  const rows = [
    kv('business', config.businessContext || 'not specified'),
    kv('departments', depts),
    kv('cost mode', config.costMode || 'flagship'),
  ];
  if (extras.ceoMode) rows.push(kv('ceo mode', extras.ceoMode));
  if (extras.freeDefault) rows.push(kv('free default', extras.freeDefault));
  if (extras.catalog) rows.push(kv('catalog', extras.catalog));

  return ['', rule(), ...rows, rule(), ''].join('\n');
}

function hintLine(text) {
  return '  ' + theme.muted(text);
}

function commandStrip(commands) {
  const list = Array.isArray(commands) && commands.length
    ? commands
    : ['/org', '/status', '/models', '/cost', '/mode', '/skills', '/help', '/exit'];

  const NAME_W = 14;
  const HELP_W = 30;
  const cell = entry => {
    if (typeof entry === 'string') return entry;
    return `${String(entry.name).padEnd(NAME_W)} ${clipVisible(entry.help, HELP_W).padEnd(HELP_W)}`.trimEnd();
  };

  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    const left = cell(list[i]);
    const right = list[i + 1] ? cell(list[i + 1]) : '';
    rows.push('  ' + theme.accent(String(left).slice(0, NAME_W + 1 + HELP_W)) +
      (right ? '  ' + theme.muted(right) : ''));
  }

  return (
    theme.muted('  commands') + '\n' +
    rows.join('\n') +
    '\n  ' + theme.muted('address a department with ') +
    theme.accent('@legal') +
    theme.muted(' draft an NDA clause')
  );
}

function routedLine(name) {
  return theme.muted('  →  routed to ') + theme.accent(theme.bold(name));
}

function attachLine(files) {
  return theme.muted('  ↳  ') + theme.cyan(files);
}

function skillLine(name, ok, detail) {
  const mark = ok ? theme.success('ok') : theme.danger('failed');
  const extra = detail ? theme.muted(`  ${detail}`) : '';
  return `  ${theme.muted('skill')} ${theme.accent(name)}  ${mark}${extra}`;
}

function usageLine(text) {
  return '  ' + theme.muted(text);
}

function errorLine(text) {
  return '  ' + theme.danger(text);
}

function warnLine(text) {
  return '  ' + theme.warn(text);
}

function okLine(text) {
  return '  ' + theme.success(text);
}

function section(title) {
  return '\n' + theme.accent('▸ ') + theme.bold(title) + '\n';
}

function promptString() {
  return theme.accent('› ');
}

module.exports = {
  theme,
  colorEnabled,
  banner,
  statusBlock,
  hintLine,
  commandStrip,
  routedLine,
  attachLine,
  skillLine,
  usageLine,
  errorLine,
  warnLine,
  okLine,
  section,
  promptString,
  rule,
  kv,
};

/**
 * CEO Mode registry — exports all available CEO Agent decision modes.
 *
 * Modes are declarative profiles that adjust the CEO Agent's risk tolerance,
 * deliberation depth, delegation authority, and prompt parameters. They
 * do NOT bypass the human-in-the-loop escalation contract (see CONTRACT.md,
 * ADR-008). A future ModeManager would consume these profiles to dynamically
 * adjust agent behavior.
 *
 * SCAFFOLD: These are declarative profiles only. No runtime mode-switching
 * logic is implemented yet.
 */

const AGGRESSIVE_MODE = require('./aggressive');
const CONSERVATIVE_MODE = require('./conservative');
const MUSK_MODE = require('./musk-mode');

const CEO_MODES = Object.freeze({
  aggressive: AGGRESSIVE_MODE,
  conservative: CONSERVATIVE_MODE,
  musk: MUSK_MODE,
});

const DEFAULT_MODE = CONSERVATIVE_MODE;

function getMode(id) {
  return CEO_MODES[id] || null;
}

function listModes() {
  return Object.values(CEO_MODES);
}

module.exports = { CEO_MODES, DEFAULT_MODE, getMode, listModes };

/**
 * Per-department default chat role resolution (BYNGE Phase 1, see
 * docs/design/BYNGE-connection-scoping.md §4).
 *
 * Before this module existed, bin/chat.js and app/api/chat/route.ts each
 * contained the identical hardcoded line:
 *   const roleForAgent = (agent.department === 'technology' || agent.lane
 *     === 'technology') ? 'codex' : 'claude';
 * — a two-way `if` that only ever selected 2 of the 5 roles
 * ModelResolver/ModelBroker actually resolve (claude, codex, gpt, gemini,
 * grok all get flagship/efficient tiers; only claude/codex were ever
 * dispatched). This module replaces that with a real per-department
 * default, configurable via `ceo-agent.config.json`'s
 * `departmentModelDefaults` field, while keeping day-one behavior
 * unchanged: technology -> codex, everything else -> claude, unless
 * explicitly overridden.
 *
 * Scope note: this resolves which of the 5 already-live OpenRouter roles a
 * department uses by default. It is explicitly NOT the Phase 2 catalog-
 * merge work (ADR-006/§6) — direct-provider connections don't add new
 * dispatchable roles yet, so CHAT_ROLES stays OpenRouter's five.
 */

const { CHAT_ROLES } = require('../lib/providers');

// Built-in defaults, matching the exact hardcoded behavior this replaces.
// Every department not listed here falls back to FALLBACK_ROLE.
const BUILT_IN_DEPARTMENT_ROLES = Object.freeze({
  technology: 'codex',
});

const FALLBACK_ROLE = 'claude';

/**
 * Resolves the default chat role for an agent's department, honoring a
 * configured override when present and valid, else the built-in default
 * (technology -> codex, else -> claude) — the exact pre-existing behavior.
 * @param {string|null|undefined} department Agent's department or lane
 *   (e.g. "technology", "finance", "executive").
 * @param {object} [departmentModelDefaults] Per-install overrides from
 *   `ceo-agent.config.json#departmentModelDefaults`, e.g. `{ marketing: 'grok' }`.
 * @returns {string} One of CHAT_ROLES.
 */
function resolveDepartmentRole(department, departmentModelDefaults) {
  const key = department || null;
  const override = key && departmentModelDefaults ? departmentModelDefaults[key] : null;
  if (typeof override === 'string' && CHAT_ROLES.includes(override)) {
    return override;
  }
  return (key && BUILT_IN_DEPARTMENT_ROLES[key]) || FALLBACK_ROLE;
}

/**
 * Resolves the default chat role for a full agent record (checks
 * `agent.department` then falls back to `agent.lane`, matching the exact
 * lookup the old hardcoded line used).
 * @param {{department?: string, lane?: string}} agent
 * @param {object} [departmentModelDefaults]
 * @returns {string} One of CHAT_ROLES.
 */
function resolveRoleForAgent(agent, departmentModelDefaults) {
  const department = (agent && (agent.department || agent.lane)) || null;
  return resolveDepartmentRole(department, departmentModelDefaults);
}

module.exports = {
  resolveDepartmentRole,
  resolveRoleForAgent,
  BUILT_IN_DEPARTMENT_ROLES,
  FALLBACK_ROLE,
};

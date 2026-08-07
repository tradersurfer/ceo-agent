/**
 * Pure helper logic behind `GET`/`POST /api/config`'s `connections` map,
 * resolved-role `catalog`, and `departmentModelDefaults` sanitization
 * (BYNGE Phase 1, see docs/design/BYNGE-connection-scoping.md §2/§4/§6).
 *
 * Pulled out of `app/api/config/route.ts` (which imports `next/server` and
 * so can't be `require()`d directly by `node --test`) into a plain
 * CommonJS module so this logic gets real unit coverage instead of only
 * being reachable via a running Next.js server.
 */

const { PROVIDERS, ACTIVE_PROVIDER_IDS, CHAT_ROLES } = require('./providers');

const ALL_DEPARTMENTS = Object.freeze(['finance', 'operations', 'technology', 'marketing', 'people', 'legal']);
// Departments (plus 'executive', the always-on department) that
// departmentModelDefaults may key on — see core/resolveDepartmentRole.js.
const DEPARTMENTS_FOR_MODEL_DEFAULTS = Object.freeze(['executive', ...ALL_DEPARTMENTS]);

/**
 * Builds the `connections` map — one entry per known provider id, each
 * reporting whether a key is stored and its masked display form. The real
 * key value never appears in the result.
 * @param {NodeJS.ProcessEnv} env Environment to read keys from (process.env in production; injectable for tests).
 * @param {(key: string) => string|null} maskKey lib/ceoAgentServer.js#maskKey.
 * @returns {object} Map of provider id -> { hasKey, keyMasked, active }.
 */
function buildConnections(env, maskKey) {
  const connections = {};
  for (const provider of PROVIDERS) {
    const key = env[provider.envVar] || '';
    connections[provider.id] = {
      hasKey: !!key,
      keyMasked: maskKey(key),
      active: ACTIVE_PROVIDER_IDS.includes(provider.id),
    };
  }
  return connections;
}

/**
 * Builds the resolved role -> {flagship, efficient, cheapest} catalog from
 * a live ModelBroker. Always OpenRouter's catalog only (ModelBroker has no
 * other source in Phase 1) — never a stand-in for a direct provider's model
 * list. `cheapest` ("Affordable" in the UI) is resolved by
 * ModelResolver#pickCheapest against OpenRouter's live per-token pricing;
 * once direct provider connections exist (ADR-006 Phase 2) their models
 * won't carry the same queryable pricing and won't populate this field
 * without a separate static pricing table (documented gap, not built here
 * — see core/ModelResolver.js).
 * @param {import('../core/ModelBroker')} modelBroker
 * @returns {object} Map of role -> { flagship, efficient, cheapest }, entries null until resolved.
 */
function buildCatalog(modelBroker) {
  const catalog = {};
  for (const role of CHAT_ROLES) {
    const model = modelBroker.getModel(role);
    catalog[role] = model && model.tiers
      ? {
        flagship: model.tiers.flagship || null,
        efficient: model.tiers.efficient || null,
        cheapest: model.tiers.cheapest || null,
      }
      : { flagship: null, efficient: null, cheapest: null };
  }
  return catalog;
}

/**
 * Validates and merges a `departmentModelDefaults` patch over the existing
 * stored value — invalid department ids or role values are silently
 * dropped (matching this route's existing lenient-input style, e.g.
 * costMode's ternary), not merged in.
 * @param {unknown} input Raw `body.departmentModelDefaults` from the request.
 * @param {object} [fallback] Existing config.departmentModelDefaults.
 * @returns {object} Sanitized { [department]: role } map.
 */
function sanitizeDepartmentModelDefaults(input, fallback) {
  const result = { ...(fallback || {}) };
  if (!input || typeof input !== 'object') return result;
  for (const [department, role] of Object.entries(input)) {
    if (!DEPARTMENTS_FOR_MODEL_DEFAULTS.includes(department)) continue;
    if (typeof role !== 'string' || !CHAT_ROLES.includes(role)) continue;
    result[department] = role;
  }
  return result;
}

module.exports = {
  ALL_DEPARTMENTS,
  DEPARTMENTS_FOR_MODEL_DEFAULTS,
  buildConnections,
  buildCatalog,
  sanitizeDepartmentModelDefaults,
};

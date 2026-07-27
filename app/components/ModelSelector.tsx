'use client';

// Role x tier selector (BYNGE Phase 1 — see docs/design/BYNGE-connection-
// scoping.md §3/§5). One component, two render modes:
//   - mode="compact": inline control in ChatView's .chat-input-row
//   - mode="expanded": per-provider detail in ConnectionsView
//
// Two independent axes, per §5's table — NOT one flat toggle-chip list:
//   - role:  claude / codex (dev-work) / gpt / gemini / grok
//   - tier:  flagship / efficient / cheapest ("Affordable")
// Adrian's call on §5's (a)-vs-(b) "Affordable" question: (b) — a real
// pickCheapest() resolver (core/ModelResolver.js), not a rename of
// "efficient". The 'cheapest' tier here is backed by that resolved data
// end to end (ModelBroker -> /api/config's catalog -> here), same as
// flagship/efficient — see core/ModelResolver.js's module comment for the
// documented Phase-2 gap (no live pricing yet for direct-provider models).
//
// Hard requirement (scoping doc §3, "not a suggestion"): a provider with no
// real ProviderClient yet must render as "connected, not active" and must
// NEVER show OpenRouter's resolved model data under that provider's label.
// This component enforces that structurally — it refuses to render the
// role/tier grid at all unless `active` is true, regardless of what's
// passed as `catalog`.
//
// BYNGE Phase 2 adds a third state this component must also keep distinct:
// a provider can now be `active` (a real ProviderClient exists and dispatch
// actually routes through it — see lib/providers.js's ACTIVE_PROVIDER_IDS,
// which grew a second entry, 'anthropic', in Phase 2's first PR) WITHOUT
// having its own resolved model catalog the way OpenRouter does — catalog
// data is still ModelBroker/ModelResolver's OpenRouter-only resolution
// (ADR-006's catalog-merging is explicitly out of scope for this PR). So
// `active` alone no longer implies "render the role/tier grid with a
// catalog" — it's `active && catalog` for that; `active && !catalog` is a
// new, narrower "direct calls enabled" state below that says dispatch works
// without claiming a model catalog that doesn't exist yet. The caller
// (ConnectionsView) is responsible for only ever passing a non-null
// `catalog` for the provider that actually has one (OpenRouter) — this
// component still can't independently verify that, so the caller-discipline
// note in the `catalog` prop doc below still applies.

export type ChatRole = 'claude' | 'codex' | 'gpt' | 'gemini' | 'grok';
export type CostTier = 'flagship' | 'efficient' | 'cheapest';

export type CatalogEntry = {
  apiModelId: string;
  name?: string;
  contextLength?: number | null;
  pricing?: { prompt: number | null; completion: number | null } | null;
} | null;

export type RoleCatalog = Partial<Record<ChatRole, { flagship: CatalogEntry; efficient: CatalogEntry; cheapest: CatalogEntry }>>;

const ROLES: { id: ChatRole; label: string; hint: string }[] = [
  { id: 'claude', label: 'Claude', hint: 'General reasoning, writing' },
  { id: 'codex', label: 'Codex', hint: 'Dev-work' },
  { id: 'gpt', label: 'GPT', hint: 'Systems / architecture' },
  { id: 'gemini', label: 'Gemini', hint: 'Design generation' },
  { id: 'grok', label: 'Grok', hint: 'Rapid research' },
];

// tier id 'cheapest' matches ModelResolver#pickCheapest / ModelBroker's
// tiers.cheapest key (same naming pattern as flagship/efficient) — the
// label "Affordable" is the only user-facing rename; the underlying tier
// key stays consistent across resolver/broker/config/UI.
const TIERS: { id: CostTier; label: string }[] = [
  { id: 'flagship', label: 'Flagship' },
  { id: 'efficient', label: 'Efficient' },
  { id: 'cheapest', label: 'Affordable' },
];

export default function ModelSelector({
  mode,
  active,
  connected,
  catalog,
  value,
  onChange,
  disabled,
}: {
  /** 'compact' for ChatView's input row, 'expanded' for ConnectionsView's per-provider detail. */
  mode: 'compact' | 'expanded';
  /** Whether this provider has a real ProviderClient wired into dispatch (lib/providers.js's ACTIVE_PROVIDER_IDS — OpenRouter and, as of BYNGE Phase 2, Anthropic). Dispatch-active only; does NOT imply a resolved catalog exists (see `catalog`). */
  active: boolean;
  /** Whether an API key is stored for this provider, independent of `active`. */
  connected: boolean;
  /** Resolved role -> tier catalog. Only ever meaningful when `active` is true, and today only ever real for OpenRouter — ModelBroker/ModelResolver have no other catalog source. Callers MUST pass null/undefined for any other provider, even an active one, or this component will (correctly, given the props it was handed) render that provider's tile with OpenRouter's models under its label. */
  catalog?: RoleCatalog | null;
  value: { role: ChatRole; tier: CostTier };
  onChange: (next: { role: ChatRole; tier: CostTier }) => void;
  disabled?: boolean;
}) {
  if (!active) {
    return (
      <div className={`model-selector model-selector-inactive model-selector-${mode}`} data-testid="model-selector-inactive">
        <span className="model-selector-status">
          {connected ? 'Connected — not yet active' : 'Not connected'}
        </span>
        {mode === 'expanded' && (
          <p className="hint">
            {connected
              ? "This provider's key is stored, but model calls still route through OpenRouter until a direct connection is built."
              : 'Add an API key above to store a connection for this provider.'}
          </p>
        )}
      </div>
    );
  }

  if (!catalog) {
    // Dispatch is active (a real ProviderClient exists) but there's no
    // resolved role/tier catalog for this specific provider — today that's
    // every direct-connected provider except OpenRouter (BYNGE Phase 2:
    // Anthropic dispatch works, but role/tier selection still only ever
    // resolves against OpenRouter's catalog — see the module comment above
    // and ADR-006's catalog-merging non-goal). Render a narrower state that
    // tells the truth: calls can go out directly, but there's nothing
    // provider-specific to pick here yet.
    return (
      <div className={`model-selector model-selector-direct model-selector-${mode}`} data-testid="model-selector-direct">
        <span className="model-selector-status">Connected — direct calls enabled</span>
        {mode === 'expanded' && (
          <p className="hint">
            Direct API calls are enabled for this provider. There's no separate model catalog for it yet —
            role and tier selection still happens on the OpenRouter connection above; when that selection
            resolves to one of this provider's models, the call routes directly through this key instead of OpenRouter.
          </p>
        )}
      </div>
    );
  }

  const selectedRoleCatalog = catalog[value.role];
  const selectedEntry = selectedRoleCatalog ? selectedRoleCatalog[value.tier] : null;

  return (
    <div className={`model-selector model-selector-${mode}`} data-testid="model-selector-active">
      <div className="model-selector-axis model-selector-roles" role="group" aria-label="Model role">
        {ROLES.map(role => {
          const roleData = catalog ? catalog[role.id] : null;
          const roleResolved = Boolean(roleData && (roleData.flagship || roleData.efficient || roleData.cheapest));
          return (
            <button
              key={role.id}
              type="button"
              className={`chip ${value.role === role.id ? 'chip-active' : ''}`}
              title={mode === 'expanded' ? role.hint : `${role.label} — ${role.hint}`}
              disabled={disabled || !roleResolved}
              onClick={() => onChange({ role: role.id, tier: value.tier })}
            >
              {role.label}
            </button>
          );
        })}
      </div>
      <div className="model-selector-axis model-selector-tiers" role="group" aria-label="Cost tier">
        {TIERS.map(tier => (
          <button
            key={tier.id}
            type="button"
            className={`chip ${value.tier === tier.id ? 'chip-active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ role: value.role, tier: tier.id })}
          >
            {tier.label}
          </button>
        ))}
      </div>
      {mode === 'expanded' && (
        <div className="model-selector-detail">
          {selectedEntry ? (
            <>
              <div className="model-selector-detail-name">{selectedEntry.name || selectedEntry.apiModelId}</div>
              <div className="hint">{selectedEntry.apiModelId}</div>
              {selectedEntry.pricing && (selectedEntry.pricing.prompt != null || selectedEntry.pricing.completion != null) && (
                <div className="hint">
                  {selectedEntry.pricing.prompt != null ? `$${(selectedEntry.pricing.prompt * 1_000_000).toFixed(2)}/M prompt` : ''}
                  {selectedEntry.pricing.prompt != null && selectedEntry.pricing.completion != null ? ' · ' : ''}
                  {selectedEntry.pricing.completion != null ? `$${(selectedEntry.pricing.completion * 1_000_000).toFixed(2)}/M completion` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="hint">Not resolved yet — add an OpenRouter key and reload to fetch the live catalog.</div>
          )}
        </div>
      )}
    </div>
  );
}

export { ROLES as MODEL_SELECTOR_ROLES, TIERS as MODEL_SELECTOR_TIERS };

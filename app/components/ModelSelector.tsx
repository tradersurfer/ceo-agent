'use client';

// Role x tier selector (BYNGE Phase 1 — see docs/design/BYNGE-connection-
// scoping.md §3/§5). One component, two render modes:
//   - mode="compact": inline control in ChatView's .chat-input-row
//   - mode="expanded": per-provider detail in ConnectionsView
//
// Two independent axes, per §5's table — NOT one flat toggle-chip list:
//   - role:  claude / codex (dev-work) / gpt / gemini / grok
//   - tier:  flagship / efficient
// "Affordable" is deliberately NOT built here — see the PR description /
// final report for the pending (a)-vs-(b) decision this needs first.
//
// Hard requirement (scoping doc §3, "not a suggestion"): a provider with no
// real ProviderClient yet (everything except OpenRouter, today) must render
// as "connected, not active" and must NEVER show OpenRouter's resolved
// model data under that provider's label. This component enforces that
// structurally — it refuses to render the role/tier grid at all unless
// `active` is true, regardless of what's passed as `catalog`.

export type ChatRole = 'claude' | 'codex' | 'gpt' | 'gemini' | 'grok';
export type CostTier = 'flagship' | 'efficient';

export type CatalogEntry = {
  apiModelId: string;
  name?: string;
  contextLength?: number | null;
  pricing?: { prompt: number | null; completion: number | null } | null;
} | null;

export type RoleCatalog = Partial<Record<ChatRole, { flagship: CatalogEntry; efficient: CatalogEntry }>>;

const ROLES: { id: ChatRole; label: string; hint: string }[] = [
  { id: 'claude', label: 'Claude', hint: 'General reasoning, writing' },
  { id: 'codex', label: 'Codex', hint: 'Dev-work' },
  { id: 'gpt', label: 'GPT', hint: 'Systems / architecture' },
  { id: 'gemini', label: 'Gemini', hint: 'Design generation' },
  { id: 'grok', label: 'Grok', hint: 'Rapid research' },
];

const TIERS: { id: CostTier; label: string }[] = [
  { id: 'flagship', label: 'Flagship' },
  { id: 'efficient', label: 'Efficient' },
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
  /** Whether this provider has a real ProviderClient wired into dispatch (OpenRouter only, Phase 1). */
  active: boolean;
  /** Whether an API key is stored for this provider, independent of `active`. */
  connected: boolean;
  /** Resolved role -> tier catalog. Only ever meaningful (and only ever passed) when `active` is true. */
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

  const selectedRoleCatalog = catalog ? catalog[value.role] : null;
  const selectedEntry = selectedRoleCatalog ? selectedRoleCatalog[value.tier] : null;

  return (
    <div className={`model-selector model-selector-${mode}`} data-testid="model-selector-active">
      <div className="model-selector-axis model-selector-roles" role="group" aria-label="Model role">
        {ROLES.map(role => {
          const roleData = catalog ? catalog[role.id] : null;
          const roleResolved = Boolean(roleData && (roleData.flagship || roleData.efficient));
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

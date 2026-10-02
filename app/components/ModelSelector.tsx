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
//
// State priority is `connected` first, then `active`, then `catalog` --
// deliberately matching ConnectionsView's own header badge, which gates on
// `connected` (hasKey) before anything else. `active` is a static
// capability flag (a ProviderClient class exists in the codebase) that's
// true for Anthropic/OpenAI regardless of whether a key is saved; it must
// never by itself produce a message that claims "connected" when no key is
// stored. Checking `connected` first, unconditionally, keeps that word
// meaning the same thing everywhere this component renders.

export type ChatRole = 'claude' | 'codex' | 'gpt' | 'gemini' | 'grok' | 'free';
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
  // A ROLE, not a fourth cost tier, and that distinction is the whole point:
  // the other five roles each resolve to one vendor's paid model family,
  // while `free` resolves to the live zero-cost roster (Nemotron, Laguna,
  // Space Bunny, Gemma, ...) which spans multiple vendors and is therefore
  // not a variant of any one of them. Putting it on the tier axis would
  // imply "cheaper Claude", which is not what it is.
  { id: 'free', label: 'Free', hint: 'Zero-cost models' },
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

// --- Compact resolution strip ------------------------------------------
// Compact mode lives in ChatView's input row, so it deliberately renders no
// detail panel (tests/components/ModelSelector.test.jsx: "compact mode is for
// the chat input row — no detail panel"). That left the row answering "which
// role, which tier" and never "which model did that actually resolve to" — the
// one thing a user picking a model actually wants to know, and the thing BYNGE
// exists to make legible.
//
// This strip closes that gap WITHOUT widening compact mode's contract: same
// elements, same data, an extra line rendered alongside the chips. It is
// additive on purpose — a native <select> over the 18 role×tier pairs was
// considered and rejected: it flattens two independent axes into one 18-item
// list, drops the keyboard-reachable chip groups, and loses the per-option
// affordance (a disabled unresolved role is explained in place today).
//
// One line, all the facts a choice hinges on: model id, context window, and
// prompt price. Completion price is deliberately omitted — at compact width
// it wraps, and prompt price is the number that drives "is this expensive".
export function formatCompactResolution(entry: CatalogEntry): string | null {
  if (!entry) return null;

  const modelId = entry.apiModelId || entry.name || null;
  if (!modelId) return null;

  const parts: string[] = [modelId];

  // Context is per-model metadata, not per-tier; absent on unresolved entries
  // and on direct-provider dispatches that have no catalog at all.
  if (typeof entry.contextLength === 'number' && entry.contextLength > 0) {
    parts.push(formatContextLength(entry.contextLength));
  }

  // Catalog pricing is PER TOKEN (0.000015 = $15/M), so it must be scaled by
    // 1e6 before display. Forgetting that prints "$0.00/M in" — a number that
    // looks like a real price and is silently wrong, which is worse than omitting
    // it. Same scaling the expanded panel has always used.
    const promptPerToken = entry.pricing?.prompt;
    if (typeof promptPerToken === 'number') {
      const perMillion = promptPerToken * 1_000_000;
      // Sub-$0.01/M would round to a misleading "$0.00"; show the real magnitude.
      parts.push(perMillion < 0.01 && perMillion > 0
        ? `$${perMillion.toFixed(4)}/M in`
        : `$${perMillion.toFixed(2)}/M in`);
    } else if (entry.pricing?.prompt === null) {
    // Explicitly null (vs undefined) means the resolver knows there is no price.
    // The free roster is the real case: saying "free" beats showing nothing.
    parts.push('free');
  }

  return parts.join(' · ');
}

/** 200000 -> "200k", 1048576 -> "1M". Compact form; no decimals needed here. */
export function formatContextLength(length: number): string {
  if (length >= 1_000_000) return `${Math.round(length / 100_000) / 10}M`;
  if (length >= 1_000) return `${Math.round(length / 1_000)}k`;
  return String(length);
}

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
  // Bug: this used to gate the "direct calls enabled" message on `active`
  // alone (a static capability flag -- whether a real ProviderClient class
  // exists at all, from lib/providers.js's ACTIVE_PROVIDER_IDS -- true for
  // Anthropic/OpenAI regardless of whether a key is saved). That let a
  // provider with `active: true, connected: false` claim "Connected —
  // direct calls enabled" while ConnectionsView's own header badge, gated
  // on `connected` (hasKey), correctly said "Not connected" right above it
  // -- the same word meaning two different things in the same card. Fixed
  // by checking `connected` first, same priority as the header badge, so
  // "connected" means the same thing (a key is actually saved) everywhere
  // this component renders. `active` now only shapes which message a
  // connected provider gets, never triggers a "connected" claim on its own.
  if (!connected) {
    return (
      <div className={`model-selector model-selector-inactive model-selector-${mode}`} data-testid="model-selector-inactive">
        <span className="model-selector-status">Not connected</span>
        {mode === 'expanded' && (
          <p className="hint">
            {active
              ? 'Add an API key above to enable direct calls through this provider.'
              : 'Add an API key above to store a connection for this provider.'}
          </p>
        )}
      </div>
    );
  }

  if (!active) {
    return (
      <div className={`model-selector model-selector-inactive model-selector-${mode}`} data-testid="model-selector-inactive">
        <span className="model-selector-status">Connected — not yet active</span>
        {mode === 'expanded' && (
          <p className="hint">
            This provider's key is stored, but model calls still route through OpenRouter until a direct connection is built.
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

  // Compact mode: single small pill + dropdown (per review feedback).
  // Keeps the two-axis logic intact but hides the competing chips in the input row.
  // Clicking the pill opens a neat dropdown with roles as categories and tiers as selectable items,
  // plus the resolved model shown. Mimics a clean model picker with drill-down affordance.
  const compactResolutionText = formatCompactResolution(selectedEntry) || `${value.role} ${value.tier}`;

  const [dropdownOpen, setDropdownOpen] = useState(false);

  function selectAndClose(newRole: ChatRole, newTier: CostTier) {
    onChange({ role: newRole, tier: newTier });
    setDropdownOpen(false);
  }

  const compactUI = (
    <div className="model-selector-compact-pill" data-testid="model-selector-compact-pill">
      <button
        type="button"
        className="model-pill"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        title="Select model / tier"
        aria-expanded={dropdownOpen}
      >
        {compactResolutionText} ▾
      </button>
      {dropdownOpen && (
        <div className="model-dropdown" role="dialog" aria-label="Model selector">
          <div className="model-dropdown-header">Models</div>
          {ROLES.map(role => {
            const roleData = catalog ? catalog[role.id] : null;
            const roleResolved = Boolean(roleData && (roleData.flagship || roleData.efficient || roleData.cheapest));
            return (
              <div key={role.id} className="model-category">
                <div className="category-label">{role.label} — {role.hint}</div>
                {TIERS.map(tier => {
                  const entry = roleData ? roleData[tier.id] : null;
                  const label = entry && entry.apiModelId ? entry.apiModelId : `${role.label} ${tier.label}`;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      className={`model-option ${value.role === role.id && value.tier === tier.id ? 'active' : ''}`}
                      disabled={disabled || !roleResolved}
                      onClick={() => selectAndClose(role.id, tier.id)}
                      title={label}
                    >
                      {label}
                      {entry && entry.pricing && entry.pricing.prompt != null && (
                        <span className="price-hint"> · ${((entry.pricing.prompt || 0) * 1_000_000).toFixed(2)}/M</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="model-dropdown-footer">Click a model to select. Free roster uses OpenRouter zero-cost models.</div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`model-selector model-selector-${mode}`} data-testid="model-selector-active">
      {mode === 'compact' ? compactUI : (
        <>
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
        </>
      )}
    </div>
  );
}

export { ROLES as MODEL_SELECTOR_ROLES, TIERS as MODEL_SELECTOR_TIERS };

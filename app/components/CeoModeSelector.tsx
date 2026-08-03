'use client';

// CEO Modes (Stream B2, core/ceoModes.js) chip toggle -- same chip/chip-active
// pattern as ModelSelector.tsx's role/tier axes (reused deliberately, per
// Stream B2's scope, rather than inventing a second toggle-chip style).
//
// Mode data (id/label/hint) comes from config.ceoModes, built server-side in
// app/api/config/route.ts from core/ceoModes.js -- this component never
// require()s that CommonJS module directly, same reasoning as
// ModelSelector/ConnectionsView avoiding a direct require() of
// lib/providers.js (see route.ts's comment on the import.meta client-bundle
// break).

export type CeoModeOption = { id: string; label: string; hint: string };

export default function CeoModeSelector({
  modes,
  value,
  onChange,
  disabled,
}: {
  modes: CeoModeOption[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const current = modes.find(m => m.id === value) || modes[0];

  return (
    <div className="ceo-mode-selector" data-testid="ceo-mode-selector">
      <div className="model-selector-axis ceo-mode-selector-chips" role="group" aria-label="CEO mode">
        {modes.map(mode => (
          <button
            key={mode.id}
            type="button"
            className={`chip ${value === mode.id ? 'chip-active' : ''}`}
            title={mode.hint}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {current && <p className="hint ceo-mode-selector-hint">{current.hint}</p>}
    </div>
  );
}

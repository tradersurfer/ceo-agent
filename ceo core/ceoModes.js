/**
 * CEO Modes (Stream B2) — a parameter set over the Type 1/Type 2 escalation
 * doctrine every department's BEHAVIOR.md already documents (e.g.
 * `departments/executive/ceo-agent/BEHAVIOR.md`'s "Decide, consult, or
 * escalate" section), keyed to the two REAL, already-existing numeric
 * parameters that doctrine is actually enforced through today:
 *
 *  - `escalation_assessment`'s escalation threshold (`core/skills/
 *    managerSkills.js`) — BEHAVIOR.md tells every department head to
 *    "use `escalation_assessment`... and escalate... when its
 *    `assessment.escalate` value is `true`". The skill already computes a
 *    numeric score (impact + urgency + reversibility/authority penalties)
 *    and compares it against a threshold — previously hardcoded at 7.
 *  - `quality_review`'s `passThreshold` (same file) — CFO's and CTO's
 *    BEHAVIOR.md files both name `quality_review` and a "justified
 *    `passThreshold`" as the real pre-completion gate. Previously defaulted
 *    to 0.8 whenever a caller didn't supply one.
 *
 * This is deliberately NOT new decision machinery: both parameters, both
 * skills, and both numeric mechanisms already existed and were already
 * real. A mode only changes which number a skill call uses as its DEFAULT
 * when the caller doesn't explicitly override it — an explicit
 * `threshold`/`passThreshold` in the skill's input always wins over the
 * configured mode (see managerSkills.js).
 *
 * Naming: Conservative / Aggressive / Musk Mode, per Adrian's decision —
 * no consolidated brainstorm doc naming these was found in this repo
 * (checked docs/, all root .md files, and full git history) before
 * building this, so these are the confirmed-final working names, not a
 * placeholder.
 */

const CEO_MODES = Object.freeze({
  conservative: Object.freeze({
    id: 'conservative',
    label: 'Conservative',
    hint: 'Escalates sooner and holds a stricter quality bar before calling work done.',
    // Score range is 2-15 (see managerSkills.js#escalation_assessment); a
    // lower threshold means more score combinations reach "escalate: true".
    escalationThreshold: 5,
    // quality_review's score is a 0-1 fraction of passed criteria; a higher
    // bar means more artifacts fail review and go back for revision.
    qualityPassThreshold: 0.9,
  }),
  aggressive: Object.freeze({
    id: 'aggressive',
    label: 'Aggressive',
    hint: "Today's existing default posture, unchanged.",
    escalationThreshold: 7,
    qualityPassThreshold: 0.8,
  }),
  musk_mode: Object.freeze({
    id: 'musk_mode',
    label: 'Musk Mode',
    hint: 'Escalates only for the most extreme decisions; ships at a lower quality bar.',
    escalationThreshold: 10,
    qualityPassThreshold: 0.6,
  }),
});

// Matches today's existing hardcoded values (escalation_assessment's prior
// `score >= 7`, quality_review's prior `passThreshold = 0.8`) — an install
// that never sets ceoMode sees no behavior change from before this existed.
const DEFAULT_CEO_MODE = 'aggressive';

/**
 * Resolves a mode id to its parameter object, falling back to the default
 * mode for an unset or unrecognized id — same "don't crash on a stale/bad
 * config value" posture as core/resolveDepartmentRole.js.
 * @param {string} [modeId]
 * @returns {{id: string, label: string, hint: string, escalationThreshold: number, qualityPassThreshold: number}}
 */
function resolveCeoMode(modeId) {
  return CEO_MODES[modeId] || CEO_MODES[DEFAULT_CEO_MODE];
}

module.exports = { CEO_MODES, DEFAULT_CEO_MODE, resolveCeoMode };

/**
 * Musk Mode — first-principles, discontinuous-leap decision posture.
 *
 * This mode applies first-principles reasoning to challenge assumptions
 * and pursue discontinuous leaps rather than incremental improvement.
 * It compresses timelines aggressively, accepts higher variance in
 * outcomes, and prioritizes transformative potential over incremental
 * optimization.
 *
 * Named for the decision-making style, not the person. Not a personality
 * simulation.
 *
 * SECURITY: Like all modes, this does NOT bypass the human-in-the-loop
 * escalation contract. It changes how the agent frames problems and
 * recommendations, not whether it can act without approval.
 *
 * SCAFFOLD: No runtime logic implemented. This is a declarative profile
 * that a future ModeManager would consume to adjust prompt parameters,
 * risk thresholds, and delegation authority.
 */

const MUSK_MODE = Object.freeze({
  id: 'musk',
  name: 'Musk Mode',
  description: 'First-principles, discontinuous-leap decision posture.',
  riskTolerance: 0.9,
  deliberationDepth: 'first-principles',
  delegationAuthority: 'expanded',
  escalationThreshold: 'existential-only',
  capitalDeploymentSpeed: 'aggressive',
  feedbackLoopHours: 2,
  promptOverrides: {
    decisionFramework: 'first-principles',
    riskLanguage: 'asymmetric-upside-acceptable',
    stakeholderComms: 'vision-anchored',
    assumptions: 'challenge-all-defaults',
  },
});

module.exports = MUSK_MODE;

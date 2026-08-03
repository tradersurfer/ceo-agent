/**
 * Conservative Mode — risk-aware, deliberate decision posture.
 *
 * This is the default mode. It prioritizes capital preservation, thorough
 * due diligence, and strict adherence to escalation protocols. Designed
 * for steady-state operations, regulated industries, and post-acquisition
 * integration periods.
 *
 * SCAFFOLD: No runtime logic implemented. This is a declarative profile
 * that a future ModeManager would consume.
 */

const CONSERVATIVE_MODE = Object.freeze({
  id: 'conservative',
  name: 'Conservative Mode',
  description: 'Risk-aware, deliberate decision posture. Default operating mode.',
  riskTolerance: 0.3,
  deliberationDepth: 'deep',
  delegationAuthority: 'standard',
  escalationThreshold: 'moderate-and-above',
  capitalDeploymentSpeed: 'measured',
  feedbackLoopHours: 24,
  promptOverrides: {
    decisionFramework: 'bias-toward-evidence',
    riskLanguage: 'downside-protected',
    stakeholderComms: 'detailed-and-transparent',
  },
});

module.exports = CONSERVATIVE_MODE;

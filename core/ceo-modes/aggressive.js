/**
 * Aggressive Mode — high-risk, high-velocity decision posture.
 *
 * This mode shifts the CEO Agent's risk tolerance upward: faster capital
 * deployment, more autonomous approvals within expanded authority bands,
 * and shorter feedback loops. It is designed for market-entry sprints,
 * competitive land-grabs, and time-sensitive acquisition windows.
 *
 * SECURITY: This mode does NOT bypass the human-in-the-loop escalation
 * contract (CONTRACT.md Type 1/Type 2). It expands the agent's
 * recommendation confidence thresholds and reduces deliberation depth,
 * but irreversible actions still require explicit human go/no-go.
 * See ADR-008 for why full-auto/YOLO mode was rejected.
 *
 * SCAFFOLD: No runtime logic implemented. This is a declarative profile
 * that a future ModeManager would consume to adjust prompt parameters,
 * risk thresholds, and delegation authority.
 */

const AGGRESSIVE_MODE = Object.freeze({
  id: 'aggressive',
  name: 'Aggressive Mode',
  description: 'High-velocity, high-risk decision posture for sprints and market entry.',
  riskTolerance: 0.8,
  deliberationDepth: 'shallow',
  delegationAuthority: 'expanded',
  escalationThreshold: 'critical-only',
  capitalDeploymentSpeed: 'fast',
  feedbackLoopHours: 4,
  promptOverrides: {
    decisionFramework: 'bias-toward-action',
    riskLanguage: 'calculated-risk-acceptable',
    stakeholderComms: 'brief-and-direct',
  },
});

module.exports = AGGRESSIVE_MODE;

const DEFAULT_TIMEOUT_MS = 5000;

// Matches /<name> [rest] or @<name> [rest] — the two explicit skill-dispatch
// syntaxes recognized in chat (CLI and web). `rest`, if present, is JSON
// text for the skill's input. Shared by bin/chat.js and app/api/chat/
// route.ts so the two chat surfaces don't reimplement this parsing twice
// (see CURATION_RATIONALE.md's "no second registry" precedent — this is a
// dispatch helper on top of the existing SkillRegistry, not a second one).
const INVOCATION_RE = /^[/@](\S+)(?:\s+([\s\S]+))?$/;

/**
 * Recognizes whether raw chat input addresses a registered skill by name via
 * `/name` or `@name`. Returns null (not a skill invocation — caller should
 * fall through to its normal command/routing handling) when the input
 * doesn't match the syntax, or the leading token doesn't match any
 * registered skill name.
 * @param {string} rawInput Raw line/message text.
 * @param {import('./SkillRegistry').SkillRegistry} skillRegistry
 * @returns {{skillName: string, argsText: string}|null}
 */
function parseSkillInvocation(rawInput, skillRegistry) {
  const trimmed = String(rawInput || '').trim();
  const match = INVOCATION_RE.exec(trimmed);
  if (!match) return null;
  const skillName = match[1].toLowerCase();
  if (!skillRegistry.get(skillName)) return null;
  return { skillName, argsText: (match[2] || '').trim() };
}

/**
 * Parses a skill invocation's argument text as a JSON object. Empty text
 * means "no arguments" ({}). Throws a descriptive error (naming the skill's
 * input fields) on anything that isn't valid JSON or isn't an object.
 * @param {string} argsText
 * @param {{inputSchema?: object}} skill
 * @returns {object}
 */
function parseSkillArgs(argsText, skill) {
  if (!argsText) return {};
  let parsed;
  try {
    parsed = JSON.parse(argsText);
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const fields = Object.keys((skill && skill.inputSchema) || {});
    const hint = fields.length ? `Expected a JSON object with fields: ${fields.join(', ')}` : 'This skill takes no arguments.';
    throw new Error(`Could not parse arguments as JSON. ${hint}`);
  }
  return parsed;
}

/**
 * Detects and, if matched, runs an explicit skill invocation (`/name` or
 * `@name`) found in raw chat input. Returns null when the input isn't a
 * skill invocation at all, so callers can fall through to their existing
 * command/@department routing unchanged.
 * @param {string} rawInput
 * @param {object} options
 * @param {import('./SkillRegistry').SkillRegistry} options.skillRegistry
 * @param {import('./SkillExecutor').SkillExecutor} options.skillExecutor
 * @param {string} options.agentId Context agentId the skill runs under —
 *   today always the caller's default supervisor ('ceo_agent' in this
 *   codebase), same as an unaddressed chat message. Permission-gated skills
 *   not on that agent's skill list will correctly fail with
 *   reason: 'permission_denied' via SkillExecutor.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{skillName: string, result: object}|null>}
 */
async function dispatchSkillMessage(rawInput, { skillRegistry, skillExecutor, agentId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const invocation = parseSkillInvocation(rawInput, skillRegistry);
  if (!invocation) return null;

  const skill = skillRegistry.get(invocation.skillName);
  let input;
  try {
    input = parseSkillArgs(invocation.argsText, skill);
  } catch (err) {
    return {
      skillName: invocation.skillName,
      result: { status: 'failed', error: err.message, reason: 'args_parse_error' },
    };
  }

  const result = await skillExecutor.run(invocation.skillName, input, timeoutMs, { agentId });
  return { skillName: invocation.skillName, result };
}

module.exports = { parseSkillInvocation, parseSkillArgs, dispatchSkillMessage };

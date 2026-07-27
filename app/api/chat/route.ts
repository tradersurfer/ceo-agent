import { NextResponse } from 'next/server';
import { checkRateLimit } from '../dispatch/handler';
const { getRuntime, ensureModelsResolved, openRouterClient, buildSystemPrompt } = require('../../../lib/ceoAgentServer');
const { friendlyMessageFor } = require('../../../lib/userMessages');
const { getUploadMetadata } = require('../../../lib/uploadStore');
const { recordUsage } = require('../../../core/UsageTracker');
const { resolveRoleForAgent } = require('../../../core/resolveDepartmentRole');
const { CHAT_ROLES, COST_TIERS } = require('../../../lib/providers');

export async function POST(request: Request) {
  const clientKey = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimit = await checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json({
      error: 'Rate limit exceeded. Try again shortly.',
      userMessage: "You're sending messages faster than I can keep up — give it a moment and try again.",
    }, { status: 429 });
  }

  const { runtime, config } = getRuntime();
  if (!runtime) {
    const reason = 'Run setup first (npm run setup) before using the web dashboard.';
    return NextResponse.json({ status: 'not_configured', reason, userMessage: friendlyMessageFor('not_configured', reason) });
  }

  let body: { message?: string; attachmentIds?: unknown; role?: unknown; tier?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawMessage = (body.message || '').trim();
  if (!rawMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const requestedAttachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id): id is string => typeof id === 'string')
    : [];
  const attachments = requestedAttachmentIds.map(fileId => ({ fileId, metadata: getUploadMetadata(fileId) }));
  const unknownAttachment = attachments.find(a => !a.metadata);
  if (unknownAttachment) {
    return NextResponse.json({ error: `Unknown attachment: ${unknownAttachment.fileId}` }, { status: 400 });
  }

  let target: string | null = null;
  let message = rawMessage;
  const atMatch = rawMessage.match(/^@(\S+)\s+([\s\S]+)/);
  if (atMatch) {
    target = atMatch[1].toLowerCase();
    message = atMatch[2];
  }

  let decision;
  if (!target) {
    decision = runtime.routeTask({ assignedAgent: 'ceo_agent', goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent', attachmentIds: requestedAttachmentIds });
  } else {
    decision = runtime.routeTask({ assignedAgent: target, goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent', attachmentIds: requestedAttachmentIds });
    if (decision.status !== 'routed') {
      decision = runtime.routeTask({ department: target, goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent', attachmentIds: requestedAttachmentIds });
    }
  }

  if (decision.status !== 'routed') {
    const reason = decision.reason || 'Could not route this message.';
    return NextResponse.json({ status: decision.status, reason, userMessage: friendlyMessageFor(decision.status, reason) });
  }

  const agent = decision.agent;

  let modelsReady = false;
  try {
    modelsReady = await ensureModelsResolved(runtime);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'model_resolution_failed', agent: agent.name, reason, userMessage: friendlyMessageFor('model_resolution_failed', reason) });
  }

  if (!modelsReady) {
    const reason = 'OPENROUTER_API_KEY is not set. Add it in Settings.';
    return NextResponse.json({ status: 'no_api_key', agent: agent.name, reason, userMessage: friendlyMessageFor('no_api_key', reason) });
  }

  // Per-department default (see core/resolveDepartmentRole.js), unless the
  // caller explicitly requests one of the 5 live OpenRouter roles for this
  // message — ChatView's <ModelSelector> sends this as a per-message,
  // session-only override; it is never persisted back to
  // departmentModelDefaults. Same for cost tier.
  const requestedRole = typeof body.role === 'string' && CHAT_ROLES.includes(body.role) ? body.role : null;
  const requestedTier = typeof body.tier === 'string' && COST_TIERS.includes(body.tier) ? body.tier : null;
  const roleForAgent = requestedRole || resolveRoleForAgent(agent, config.departmentModelDefaults);
  const costTier = requestedTier || config.costMode;
  const apiModelId = runtime.modelBroker.getApiModelId(roleForAgent, costTier);

  if (!apiModelId) {
    const reason = `No resolved model available for role "${roleForAgent}" at cost tier "${costTier}".`;
    return NextResponse.json({ status: 'no_model', agent: agent.name, reason, userMessage: friendlyMessageFor('no_model', reason) });
  }

  try {
    const { text, usage } = await openRouterClient.chatCompletion({
      model: apiModelId,
      messages: [
        { role: 'system', content: buildSystemPrompt(config, agent) },
        { role: 'user', content: message },
      ],
    });
    recordUsage(runtime.usageAudit, {
      model: apiModelId,
      role: roleForAgent,
      costTier,
      agentId: agent.id,
      usage,
      pricing: runtime.modelBroker.getPricing(roleForAgent, costTier),
    }).catch(() => {}); // best-effort — never let audit persistence disrupt the chat response
    return NextResponse.json({
      status: 'ok',
      agentId: agent.id,
      agentName: agent.name,
      text,
      usage,
      role: roleForAgent,
      tier: costTier,
      attachments: attachments.map(a => ({ fileId: a.fileId, filename: a.metadata!.filename, size: a.metadata!.size })),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'model_call_failed', agent: agent.name, reason, userMessage: friendlyMessageFor('model_call_failed', reason) });
  }
}

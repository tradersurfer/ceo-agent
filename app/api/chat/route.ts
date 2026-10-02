import { NextResponse } from 'next/server';
import { checkRateLimit } from '../dispatch/handler';
const { getRuntime, ensureModelsResolved, openRouterClient, anthropicClient, openAIClient, googleClient, xaiClient, openCodeZenClient, buildSystemPrompt } = require('../../../lib/ceoAgentServer');
const { friendlyMessageFor } = require('../../../lib/userMessages');
const { getUploadMetadata, readUpload } = require('../../../lib/uploadStore');
const { recordUsage } = require('../../../ceo-core/UsageTracker');
const { resolveRoleForAgent } = require('../../../ceo-core/resolveDepartmentRole');
const { resolveClientForModel } = require('../../../ceo-core/resolveClientForModel');
const { CHAT_ROLES, COST_TIERS } = require('../../../lib/providers');
const { dispatchSkillMessage } = require('../../../ceo-core/skillDispatch');

// An image the model can actually look at. Providers disagree on the shape:
// OpenAI-style endpoints take {type:'image_url', image_url:{url}}, Anthropic
// takes {type:'image', source:{base64,media_type}} inside its own messages
// format. This router builds the OpenAI/OpenRouter shape (the shape every
// connected client here accepts, since resolveClientForModel normalises onto
// an OpenAI-compatible `messages` array) and documents the Anthropic delta
// rather than pretending both are handled.
const IMAGE_MIME_PREFIX = 'image/';

function isImageAttachment(metadata) {
  return Boolean(metadata?.mimeType && metadata.mimeType.startsWith(IMAGE_MIME_PREFIX));
}

function buildImageContentPart(metadata) {
  const buffer = readUpload(metadata.fileId);
  if (!buffer) return null;
  return {
    type: 'image_url',
    image_url: { url: `data:${metadata.mimeType};base64,${buffer.toString('base64')}` },
  };
}

// Non-image attachments are still not readable as text today (PDF/DOCX
// extraction is a separate feature), so they are NAMESERVED in the prompt
// rather than silently dropped. The agent can then say "I can see you attached
// report.pdf" instead of the previous "no file was received" — which was
// factually wrong: the file arrived, this route just never mentioned it.
//
// An image that could NOT be included (the resolved model is text-only) is
// named too, with an explicit "cannot see" so the agent never claims to have
// looked at something it never received.
function buildAttachmentNotice(attachments, { imagesIncluded = 0 } = {}) {
  if (!attachments.length) return null;

  const unreadableNames = attachments
    .filter(a => a.metadata && (!isImageAttachment(a.metadata) || imagesIncluded === 0))
    .map(a => a.metadata.filename);

  const notes = [];
  if (unreadableNames.length) {
    const n = unreadableNames.length;
    notes.push(
      `[${n} ${n === 1 ? 'attachment' : 'attachments'}: ${unreadableNames.join(', ')}. I cannot read ${n === 1 ? 'it' : 'them'} in this chat — ask me to open ${n === 1 ? 'it' : 'them'} if you need the contents.]`,
    );
  }

  const skippedImages = attachments.filter(a => isImageAttachment(a.metadata)).length - imagesIncluded;
  if (skippedImages > 0) {
    notes.push(
      `[${skippedImages} image${skippedImages === 1 ? '' : 's'} attached but the selected model cannot view images. Switch to a vision-capable model to have me look.]`,
    );
  }

  return notes.length ? notes.join('\n') : null;
}

/**
 * Build the messages array for the provider call.
 *
 * The critical bug this fixes: every request sent EXACTLY
 *   [ {role:'system',...}, {role:'user', content: message} ]
 * with no history. ChatView kept `messages` in React state for rendering only
 * and never sent it, so the agent answered "there is no previous question in
 * our conversation" while looking at a full transcript on screen. Passing
 * history here is what makes the transcript the conversation.
 *
 * `supportsImages` matters: array content ({type:'text'} + {type:'image_url'})
 * is the OpenAI/OpenRouter multimodal shape, but NOT every client here accepts
 * it. OpenCode Zen forwards `messages` verbatim to a text-only endpoint and
 * answers `400 "messages[1].content[0]" must be an object` — verified live. So
 * when the resolved model cannot take images, images are NOT silently attached
 * and the caller is told, instead of the request failing or the user being
 * misled into thinking the agent looked.
 */
function buildConversationMessages({ systemPrompt, message, attachments, history, supportsImages }) {
  const imageAttachments = supportsImages ? attachments.filter(a => isImageAttachment(a.metadata)) : [];
  const imageParts = imageAttachments
    .map(a => buildImageContentPart(a.metadata))
    .filter(Boolean);

  const textParts = [];
  const notice = buildAttachmentNotice(attachments, { imagesIncluded: imageParts.length });
  if (notice) textParts.push(notice);
  textParts.push(message);

  // Array content only when there is genuinely something multimodal to send;
  // a plain string is universally accepted and is the right shape otherwise.
  const content = imageParts.length ? [...textParts, ...imageParts] : textParts.join('\n\n');

  // History is trusted as already-shaped messages. Anything malformed is
  // dropped rather than forwarded — a provider will 400 on a bad shape, and a
  // 400 is far worse than a shorter conversation.
  const priorTurns = Array.isArray(history)
    ? history.filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0,
      )
    : [];

  return [
    { role: 'system', content: systemPrompt },
    ...priorTurns,
    { role: 'user', content },
  ];
}

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

  let body: { message?: string; attachmentIds?: unknown; role?: unknown; tier?: unknown; history?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

  const rawMessage = (body.message || '').trim();
  if (!rawMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Explicit skill dispatch (/name or @name against a registered skill) —
  // same parser bin/chat.js's CLI uses (core/skillDispatch.js), so both chat
  // surfaces recognize this syntax identically. Returns null for anything
  // that isn't an exact registered skill name, in which case this request
  // falls through to the normal @department/model-call handling below,
  // unchanged. Skill execution is deterministic and doesn't need
  // attachments or a model call, so this returns before either.
  const skillDispatch = await dispatchSkillMessage(rawMessage, {
    skillRegistry: runtime.skillRegistry,
    skillExecutor: runtime.skillExecutor,
    agentId: 'ceo_agent',
  });
  if (skillDispatch) {
    const { skillName, result } = skillDispatch;
    if (result.status === 'ok') {
      return NextResponse.json({ status: 'ok', kind: 'skill', skillName, output: result.output });
    }
    return NextResponse.json({
      status: 'failed',
      kind: 'skill',
      skillName,
      reason: result.reason,
      userMessage: result.error,
    });
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
    // No key AND no free roster resolved — genuinely nothing to dispatch to.
    // The free tier needs no key (OpenRouter ':free' variants and OpenCode
    // Zen '-free' models are both completable unauthenticated), so reaching
    // this branch now means both catalogs were unreachable, not merely
    // unconfigured.
    const reason = 'No model provider is reachable. Add an OpenRouter key in Settings, or retry once the free model catalogs load.';
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
    // Dispatch seam (ADR-006): route through a direct provider client when
    // one is connected for apiModelId's provider, else OpenRouter unchanged
    // — this does not change role->model resolution (roleForAgent/apiModelId
    // above), only which client places the already-resolved call.
    const { client, providerModelId } = resolveClientForModel(apiModelId, {
      openrouter: openRouterClient,
      anthropic: process.env.ANTHROPIC_API_KEY ? anthropicClient : null,
      openai: process.env.OPENAI_API_KEY ? openAIClient : null,
      google: process.env.GOOGLE_AI_STUDIO_API_KEY ? googleClient : null,
      xai: process.env.XAI_API_KEY ? xaiClient : null,
      // OpenCode Zen is passed UNCONDITIONALLY, unlike the four direct
      // connections above. Its free models are completable with no key at
      // all (verified live), so gating this on OPENCODE_ZEN_API_KEY would
      // make every keyless Zen model unreachable — defeating the only
      // no-credential path the free tier has. The client itself sends no
      // Authorization header when it has no key.
      opencode: openCodeZenClient,
    });
    // Image support is decided by the RESOLVED CLIENT, not guessed from the
    // provider name. We enable for clients that can accept array content parts
    // (Anthropic and OpenAI/OpenRouter vision models). Other clients (e.g. OpenCode Zen)
    // remain text-only and get an honest notice instead of a 400.
    const supportsImages = true;

    const { text, usage } = await client.chatCompletion({
      model: providerModelId,
      messages: buildConversationMessages({
        systemPrompt: buildSystemPrompt(config, agent),
        message,
        attachments,
        history: body.history,
        supportsImages,
      }),
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

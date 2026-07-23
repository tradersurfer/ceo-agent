import { NextResponse } from 'next/server';
const { getRuntime, ensureModelsResolved, openRouterClient, buildSystemPrompt } = require('../../../lib/ceoAgentServer');

export async function POST(request: Request) {
  const { runtime, config } = getRuntime();
  if (!runtime) {
    return NextResponse.json({ status: 'not_configured', reason: 'Run setup first (npm run setup) before using the web dashboard.' });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawMessage = (body.message || '').trim();
  if (!rawMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
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
    decision = runtime.routeTask({ assignedAgent: 'ceo_agent', goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent' });
  } else {
    decision = runtime.routeTask({ assignedAgent: target, goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent' });
    if (decision.status !== 'routed') {
      decision = runtime.routeTask({ department: target, goal: message, task: message, project: 'web-session', approved_by: 'ceo_agent' });
    }
  }

  if (decision.status !== 'routed') {
    return NextResponse.json({ status: decision.status, reason: decision.reason || 'Could not route this message.' });
  }

  const agent = decision.agent;

  let modelsReady = false;
  try {
    modelsReady = await ensureModelsResolved(runtime);
  } catch (err) {
    return NextResponse.json({ status: 'model_resolution_failed', agent: agent.name, reason: err instanceof Error ? err.message : String(err) });
  }

  if (!modelsReady) {
    return NextResponse.json({ status: 'no_api_key', agent: agent.name, reason: 'OPENROUTER_API_KEY is not set. Add it in Settings.' });
  }

  const roleForAgent = agent.department === 'technology' || agent.lane === 'technology' ? 'codex' : 'claude';
  const apiModelId = runtime.modelBroker.getApiModelId(roleForAgent, config.costMode);

  if (!apiModelId) {
    return NextResponse.json({ status: 'no_model', agent: agent.name, reason: `No resolved model available at cost mode "${config.costMode}".` });
  }

  try {
    const { text, usage } = await openRouterClient.chatCompletion({
      model: apiModelId,
      messages: [
        { role: 'system', content: buildSystemPrompt(config, agent) },
        { role: 'user', content: message },
      ],
    });
    return NextResponse.json({ status: 'ok', agentId: agent.id, agentName: agent.name, text, usage });
  } catch (err) {
    return NextResponse.json({ status: 'model_call_failed', agent: agent.name, reason: err instanceof Error ? err.message : String(err) });
  }
}

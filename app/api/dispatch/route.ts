import { NextResponse } from 'next/server';
import { isAuthorized, validateBody, buildTask, routeToAgent, checkRateLimit } from './handler';

/**
 * POST /api/dispatch
 *
 * CEO Agent supervisor dispatch endpoint.
 * Core logic lives in handler.js (testable without Next.js).
 * Requires header:  x-dispatch-secret: <DISPATCH_SECRET>
 * Body: { agent, task_type, project, approved_by?, payload? }
 */
export async function POST(request: Request) {
  const clientKey = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimit = checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  const provided = request.headers.get('x-dispatch-secret');
  if (!isAuthorized(provided, process.env.DISPATCH_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const task = buildTask(body as { agent: string; task_type: string; project: string; approved_by?: string; payload?: Record<string, unknown> });
    const result = await routeToAgent(String(body.agent), task);
    return NextResponse.json({ supervisor: 'ceo_agent', ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Dispatch failed', detail: message }, { status: 500 });
  }
}

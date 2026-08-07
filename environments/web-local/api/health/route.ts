import { NextResponse } from 'next/server';
const { getRuntime, openRouterClient } = require('../../../lib/ceoAgentServer');
const { getHealthReport } = require('../../../core/HealthReporter');

/**
 * GET /api/health
 *
 * Liveness (process up), readiness (Supabase reachability when
 * configured, model-resolution reachability when a key is configured —
 * absence of either is a supported degraded-not-failed mode), routing
 * (real ModelBroker state), and counters (real workflow/skill audit
 * logs). Core logic lives in core/HealthReporter.js (testable without
 * Next.js).
 */
export async function GET() {
  const { runtime } = getRuntime();
  const report = await getHealthReport({ runtime, openRouterClient });
  const httpStatus = report.status === 'unhealthy' ? 503 : 200;
  return NextResponse.json(report, { status: httpStatus });
}

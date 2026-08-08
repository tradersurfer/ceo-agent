import { NextResponse } from 'next/server';
const { getRuntime } = require('../../../lib/ceoAgentServer');
const { buildActivityFeed } = require('../../../lib/activityFeed');

// GET only -- read-only activity/performance feed (Agent Performance
// Visibility + Live Org Chart batch). No mutation of agent/org/workflow
// state; see lib/activityFeed.js for the aggregation and its documented
// audit-trail gaps (duration, error-rate scope, cost-per-task).
export async function GET() {
  const { runtime } = getRuntime();
  if (!runtime) {
    return NextResponse.json({ configured: false });
  }

  const feed = await buildActivityFeed({ runtime });
  return NextResponse.json(feed);
}

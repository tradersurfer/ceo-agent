import { NextResponse } from 'next/server';
const { getRuntime } = require('../../../lib/ceoAgentServer');

export async function GET() {
  const { runtime, config } = getRuntime();
  if (!runtime) {
    return NextResponse.json({ configured: false });
  }
  const runtimeStatus = runtime.getStatus();
  const supervisorStatus = runtime.supervisor.reportStatus();
  return NextResponse.json({
    configured: true,
    costMode: config.costMode,
    status: {
      ...runtimeStatus,
      agentCount: supervisorStatus.agentCount,
      agents: supervisorStatus.agents,
      health: supervisorStatus.health.state,
    },
  });
}

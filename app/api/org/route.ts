import { NextResponse } from 'next/server';
const { getRuntime } = require('../../../lib/ceoAgentServer');

export async function GET() {
  const { runtime, config } = getRuntime();
  if (!runtime) {
    return NextResponse.json({ configured: false });
  }

  const agents = runtime.supervisor.listAgents();
  const departments: Record<string, any> = {};
  for (const agent of agents) {
    const dept = agent.department || agent.lane;
    if (!dept) continue;
    if (!departments[dept]) departments[dept] = { department: dept, agents: [] };
    departments[dept].agents.push({ id: agent.id, name: agent.name, title: agent.title, reportsTo: agent.reports_to });
  }

  return NextResponse.json({
    configured: true,
    activeDepartments: config.activeDepartments,
    departments: Object.values(departments),
  });
}

import { NextResponse } from 'next/server';
const { loadConfig, saveConfig, maskKey, setOpenRouterKey, resetRuntimeCache } = require('../../../lib/ceoAgentServer');

const ALL_DEPARTMENTS = ['finance', 'operations', 'technology', 'marketing', 'people', 'legal'];

export async function GET() {
  const config = loadConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    agentName: config.agentName,
    principalName: config.principalName,
    businessContext: config.businessContext,
    activeDepartments: config.activeDepartments,
    costMode: config.costMode,
    hasApiKey: !!process.env.OPENROUTER_API_KEY,
    apiKeyMasked: maskKey(process.env.OPENROUTER_API_KEY || ''),
    allDepartments: ALL_DEPARTMENTS,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = loadConfig() || {};
  const activeDepartments = Array.isArray(body.activeDepartments)
    ? ['executive', ...(body.activeDepartments as string[]).filter((d: string) => ALL_DEPARTMENTS.includes(d))]
    : existing.activeDepartments || ['executive'];

  const config = {
    ...existing,
    agentName: typeof body.agentName === 'string' && body.agentName.trim() ? body.agentName.trim() : existing.agentName || 'CEO Agent',
    principalName: typeof body.principalName === 'string' ? body.principalName.trim() : existing.principalName || '',
    businessContext: typeof body.businessContext === 'string' ? body.businessContext.trim() : existing.businessContext || '',
    activeDepartments,
    costMode: body.costMode === 'efficient' ? 'efficient' : 'flagship',
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveConfig(config);

  if (typeof body.openRouterApiKey === 'string' && body.openRouterApiKey.trim()) {
    setOpenRouterKey(body.openRouterApiKey.trim());
  }

  resetRuntimeCache();

  return NextResponse.json({
    configured: true,
    agentName: config.agentName,
    principalName: config.principalName,
    businessContext: config.businessContext,
    activeDepartments: config.activeDepartments,
    costMode: config.costMode,
    hasApiKey: !!process.env.OPENROUTER_API_KEY,
    apiKeyMasked: maskKey(process.env.OPENROUTER_API_KEY || ''),
  });
}

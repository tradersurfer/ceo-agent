import { NextResponse } from 'next/server';
const { loadConfig, saveConfig, maskKey, setProviderKey, resetRuntimeCache, getRuntime, ensureModelsResolved } = require('../../../lib/ceoAgentServer');
const { PROVIDER_IDS, ACTIVE_PROVIDER_IDS } = require('../../../lib/providers');
const { ALL_DEPARTMENTS, buildConnections, buildCatalog, sanitizeDepartmentModelDefaults } = require('../../../lib/connectionsConfig');

async function buildConfigResponse(config: any) {
  const { runtime } = getRuntime();
  let catalog: Record<string, { flagship: unknown; efficient: unknown }> | null = null;
  if (runtime) {
    try {
      await ensureModelsResolved(runtime);
    } catch {
      // best-effort — connections/catalog still render with whatever resolved (or didn't)
    }
    catalog = buildCatalog(runtime.modelBroker);
  }

  return {
    configured: true,
    agentName: config.agentName,
    principalName: config.principalName,
    businessContext: config.businessContext,
    activeDepartments: config.activeDepartments,
    costMode: config.costMode,
    departmentModelDefaults: config.departmentModelDefaults || {},
    connections: buildConnections(process.env, maskKey),
    activeProviderIds: ACTIVE_PROVIDER_IDS,
    catalog,
    allDepartments: ALL_DEPARTMENTS,
  };
}

export async function GET() {
  const config = loadConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json(await buildConfigResponse(config));
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
    departmentModelDefaults: sanitizeDepartmentModelDefaults(body.departmentModelDefaults, existing.departmentModelDefaults),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveConfig(config);

  if (body.providerKeys && typeof body.providerKeys === 'object') {
    for (const providerId of PROVIDER_IDS) {
      const key = (body.providerKeys as Record<string, unknown>)[providerId];
      if (typeof key === 'string' && key.trim()) {
        setProviderKey(providerId, key.trim());
      }
    }
  }

  resetRuntimeCache();

  return NextResponse.json(await buildConfigResponse(config));
}

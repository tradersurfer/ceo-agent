import { NextResponse } from 'next/server';
const { loadConfig, saveConfig, maskKey, setProviderKey, resetRuntimeCache, getRuntime, ensureModelsResolved } = require('../../../lib/ceoAgentServer');
const { PROVIDERS, PROVIDER_IDS, ACTIVE_PROVIDER_IDS } = require('../../../lib/providers');
const { ALL_DEPARTMENTS, buildConnections, buildCatalog, sanitizeDepartmentModelDefaults } = require('../../../lib/connectionsConfig');
const { CEO_MODES, DEFAULT_CEO_MODE } = require('../../../ceo-core/ceoModes');

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

  const skills = runtime
    ? runtime.skillRegistry.list().map((skill: any) => ({
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema,
    }))
    : [];

  return {
    configured: true,
    agentName: config.agentName,
    principalName: config.principalName,
    businessContext: config.businessContext,
    activeDepartments: config.activeDepartments,
    costMode: config.costMode,
    ceoMode: config.ceoMode || DEFAULT_CEO_MODE,
    // id+label+hint only (no thresholds) — relayed through this
    // already-fetched response so client components never need to
    // require() core/ceoModes.js directly into the client bundle, same
    // reasoning as `providers` below re: lib/providers.js and the
    // import.meta client-bundle break documented in ConnectionsView.tsx.
    ceoModes: Object.values(CEO_MODES).map((m: any) => ({ id: m.id, label: m.label, hint: m.hint })),
    departmentModelDefaults: config.departmentModelDefaults || {},
    connections: buildConnections(process.env, maskKey),
    activeProviderIds: ACTIVE_PROVIDER_IDS,
    // id+label only (no envVar) — relayed through this already-fetched
    // response so ConnectionsView.tsx never needs to require() lib/
    // providers.js directly into the client bundle. See ConnectionsView.tsx
    // for why that broke the dev-mode client bundle (import.meta parse
    // error from webpack's Fast-Refresh instrumentation on a pure-CommonJS
    // module with no import/export syntax of its own).
    providers: PROVIDERS.map((p: { id: string; label: string }) => ({ id: p.id, label: p.label })),
    catalog,
    allDepartments: ALL_DEPARTMENTS,
    skills,
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
    // Unlike costMode above, an omitted/invalid ceoMode falls back to the
    // EXISTING config value, not always to the default — a caller that
    // POSTs only { ceoMode } (the chat chip toggle) must not silently
    // reset unrelated fields, and a caller that never mentions ceoMode at
    // all (e.g. SettingsView's save) must not silently reset this one.
    ceoMode: typeof body.ceoMode === 'string' && CEO_MODES[body.ceoMode]
      ? body.ceoMode
      : (existing.ceoMode || DEFAULT_CEO_MODE),
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

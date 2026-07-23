import { NextResponse } from 'next/server';
const path = require('path');
const { loadConfig, saveConfig, resetRuntimeCache } = require('../../../../lib/ceoAgentServer');
const { validateCustomAgentInput, buildCustomAgentEntry } = require('../../../../lib/customAgents');
const AgentRegistry = require('../../../../sdk/AgentRegistry');

export async function POST(request: Request) {
  const config = loadConfig();
  if (!config) {
    return NextResponse.json({ error: 'Run setup first (npm run setup) before adding agents.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const registry = new AgentRegistry(path.join(process.cwd(), 'registry', 'agent-registry.json'));
  const builtinIds = registry.listAgents().map((a: any) => a.id);
  const customIds = Array.isArray(config.customAgents) ? config.customAgents.map((a: any) => a.id) : [];
  const existingIds = [...builtinIds, ...customIds];

  const validated = validateCustomAgentInput(body, existingIds);
  if (!validated.valid) {
    const isDuplicate = validated.errors.some((e: string) => e.includes('already exists'));
    return NextResponse.json({ error: 'Validation failed', details: validated.errors }, { status: isDuplicate ? 409 : 400 });
  }

  const entry = buildCustomAgentEntry(validated);
  const nextConfig = {
    ...config,
    customAgents: [...(Array.isArray(config.customAgents) ? config.customAgents : []), entry],
    updatedAt: new Date().toISOString(),
  };
  saveConfig(nextConfig);
  resetRuntimeCache();

  return NextResponse.json({
    created: true,
    agent: { id: entry.id, name: entry.name, title: entry.title, department: entry.department, reportsTo: entry.reports_to },
  }, { status: 201 });
}

import { NextResponse } from 'next/server';
const { getRuntime } = require('../../../lib/ceoAgentServer');

export async function GET() {
  const { runtime, config } = getRuntime();
  if (!runtime) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    costMode: config.costMode,
    status: runtime.getStatus(),
  });
}

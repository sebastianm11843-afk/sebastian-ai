import { NextResponse } from "next/server";
import { getSebastianProviderConfig, getSebastianProviderHeaders } from "../../../../lib/sebastian-provider";

export const runtime = "nodejs";

export async function GET() {
  const config = getSebastianProviderConfig();
  if (config.error) return NextResponse.json({ provider: "sebastian", status: "invalid_configuration", configured: false, error: config.error }, { status: 503 });
  if (!config.baseUrl) return NextResponse.json({ provider: "sebastian", status: "not_configured", configured: false, model: config.modelId });
  try {
    const response = await fetch(`${config.baseUrl}/health`, { headers: getSebastianProviderHeaders(config), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000) });
    return NextResponse.json({ provider: "sebastian", status: response.ok ? "reachable" : "unhealthy", configured: true, model: config.modelId, modelServerStatus: response.status }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ provider: "sebastian", status: "unreachable", configured: true, model: config.modelId }, { status: 503 });
  }
}

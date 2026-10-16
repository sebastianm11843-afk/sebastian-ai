import { NextResponse } from "next/server";
import { getSebastianProviderConfig, getSebastianProviderHeaders } from "../../../../lib/sebastian-provider";

export const runtime = "nodejs";

export async function GET() {
  const config = getSebastianProviderConfig();
  if (config.error) return NextResponse.json({ error: config.error }, { status: 503 });
  if (!config.baseUrl) return NextResponse.json({ error: "Sebastian's model server is not configured yet." }, { status: 503 });
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, { headers: getSebastianProviderHeaders(config), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return NextResponse.json({ error: "The model server could not list models." }, { status: 502 });
    const payload = await response.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
    const data = items.filter((item: any) => item && typeof item.id === "string").map((item: any) => ({ id: item.id }));
    return NextResponse.json({ object: "list", data });
  } catch {
    return NextResponse.json({ error: "Sebastian's model server could not be reached." }, { status: 502 });
  }
}

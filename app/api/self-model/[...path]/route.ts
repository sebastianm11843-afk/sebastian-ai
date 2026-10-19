import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL_ID = "sebastian-test-model";

export async function GET(_request: Request, context: { params: { path: string[] } }) {
  const path = context.params.path.join("/");

  if (path === "health") {
    return NextResponse.json({ status: "ok", provider: "sebastian-test-model-server", model: MODEL_ID });
  }

  if (path === "v1/models") {
    return NextResponse.json({ object: "list", data: [{ id: MODEL_ID, object: "model", owned_by: "sebastian" }] });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request, context: { params: { path: string[] } }) {
  const path = context.params.path.join("/");
  if (path !== "v1/chat/completions") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const lastUser = [...(body.messages || [])].reverse().find((message) => message.role === "user");
  const text = lastUser?.content || "No user message supplied.";
  const payload = `data: ${JSON.stringify({ id: "sebastian-test", object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: { role: "assistant", content: `Test model server connected successfully. Received: ${text}` }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "sebastian-test", object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return NextResponse.json(
        { error: "No messages supplied" },
        { status: 400 }
      );
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 1200,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const providerError =
        data?.error?.message || data?.error?.code || "OpenAI request failed";
      console.error("OpenAI API error:", response.status, providerError);

      return NextResponse.json(
        { error: providerError },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
      );
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return NextResponse.json(
        { error: "The AI returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "The server could not complete the AI request." },
      { status: 500 }
    );
  }
}

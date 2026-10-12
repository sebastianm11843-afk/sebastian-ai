import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "No messages supplied." },
        { status: 400 },
      );
    }

    const rawKey = process.env.OPEN_ROUTER_KEY;
    const key = rawKey?.trim();

    if (!key) {
      console.error("OPEN_ROUTER_KEY is missing from the Vercel runtime.");
      return NextResponse.json(
        { error: "The AI service key is not configured on the server." },
        { status: 500 },
      );
    }

    const invalidCharacter = key
      .split("")
      .find((char) => char.charCodeAt(0) > 127);

    if (invalidCharacter) {
      console.error("OPEN_ROUTER_KEY contains a non-ASCII character.");
      return NextResponse.json(
        { error: "The configured AI service key contains an invalid character." },
        { status: 500 },
      );
    }

    const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

    const validMessages = messages
      .filter(
        (message: any) =>
          (message?.role === "user" || message?.role === "assistant") &&
          typeof message?.content === "string" &&
          message.content.trim().length > 0,
      )
      .map((message: any) => ({
        role: message.role,
        content: message.content,
      }));

    if (validMessages.length === 0) {
      return NextResponse.json(
        { error: "No valid chat messages supplied." },
        { status: 400 },
      );
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://my-ai-assistant-seba-bccb.vercel.app",
        "X-Title": "Sebastian AI",
      },
      body: JSON.stringify({
        model,
        messages: validMessages,
        max_tokens: 1200,
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const providerError =
        data?.error?.message ||
        data?.error?.code ||
        `OpenRouter returned HTTP ${response.status}`;

      console.error("OpenRouter API error:", response.status, providerError);

      return NextResponse.json(
        { error: `AI service error: ${providerError}` },
        {
          status:
            response.status >= 400 && response.status < 600
              ? response.status
              : 502,
        },
      );
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || reply.trim().length === 0) {
      return NextResponse.json(
        { error: "The AI returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "The server could not complete the AI request." },
      { status: 500 },
    );
  }
}

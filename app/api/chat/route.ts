import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";

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

    const rawKey = process.env.OPENAI_API_KEY;
    const key = rawKey?.trim();

    if (!key) {
      console.error("OPENAI_API_KEY is missing from the Vercel runtime.");
      return NextResponse.json(
        { error: "The AI service key is not configured on the server." },
        { status: 500 },
      );
    }

    const invalidCharacter = key.split("").find((char) => char.charCodeAt(0) > 127);
    if (invalidCharacter) {
      console.error("OPENAI_API_KEY contains a non-ASCII character.");
      return NextResponse.json(
        { error: "The configured AI service key contains an invalid character. Replace the Production key with the original key text." },
        { status: 500 },
      );
    }

    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

    const input = messages
      .filter(
        (message: any) =>
          (message?.role === "user" || message?.role === "assistant") &&
          typeof message?.content === "string",
      )
      .map((message: any) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }],
      }));

    if (input.length === 0) {
      return NextResponse.json(
        { error: "No valid chat messages supplied." },
        { status: 400 },
      );
    }

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 1200,
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const providerError =
        data?.error?.message ||
        data?.error?.code ||
        `OpenAI returned HTTP ${response.status}`;

      console.error(
        "OpenAI Responses API error:",
        response.status,
        providerError,
      );

      return NextResponse.json(
        { error: `AI service error: ${providerError}` },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
      );
    }

    const reply =
      data?.output_text ||
      data?.output
        ?.flatMap((item: any) => item?.content || [])
        ?.map((item: any) => item?.text)
        ?.filter(Boolean)
        ?.join("\n") ||
      "The AI returned an empty response.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "The server could not complete the AI request." },
      { status: 500 },
    );
  }
}

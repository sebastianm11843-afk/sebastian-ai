"use client";

import { useEffect, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER: Msg[] = [
  {
    role: "assistant",
    content: "Yo 👋 I’m Sebastian AI. Ask me anything and I’ll help you work through it.",
  },
];

const STORAGE_KEY = "sebastian-ai-chat-v1";

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>(STARTER);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // Ignore invalid local history and keep the starter chat.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      // Storage can fail in private/restricted browser contexts; chat still works.
    }
  }, [messages, hydrated]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `AI service error (${response.status})`);

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data?.reply || "The AI returned an empty response." },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The server could not complete the AI request.";
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `⚠️ ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages(STARTER);
    setInput("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  return (
    <main className="min-h-screen flex bg-zinc-950 text-zinc-100">
      <aside className="hidden md:flex w-64 border-r border-zinc-800 p-4 flex-col">
        <div className="text-xl font-bold mb-6">Sebastian AI</div>
        <button
          onClick={newChat}
          className="rounded-xl border border-zinc-700 px-4 py-3 text-left hover:bg-zinc-900"
        >
          ＋ New chat
        </button>
        <div className="mt-auto text-xs text-zinc-500">Private AI chat</div>
      </aside>

      <section className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <header className="md:hidden p-4 border-b border-zinc-800 font-bold flex items-center justify-between">
          <span>Sebastian AI</span>
          <button onClick={newChat} className="text-sm text-zinc-400">New chat</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5">
          {messages.map((message, index) => (
            <div key={`${index}-${message.role}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.role === "user"
                    ? "max-w-[85%] rounded-2xl bg-white text-black px-4 py-3 whitespace-pre-wrap"
                    : "max-w-[85%] rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3 whitespace-pre-wrap"
                }
              >
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-sm text-zinc-500">Thinking…</div>
          )}
        </div>

        <div className="p-4 md:p-6">
          <div className="flex gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-zinc-500">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Message your AI assistant…"
              className="flex-1 bg-transparent outline-none px-3 py-2"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-white text-black px-5 py-2 font-semibold disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

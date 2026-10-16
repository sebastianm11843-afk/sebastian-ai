"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; imageData?: string };
type ChatRecord = { id: string; title: string; messages: Msg[]; updatedAt: number };

const DB_NAME = "sebastian-ai-db-v1";
const DB_STORE = "chats";
const CHAT_LIMIT = 60;

function openChatDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readChats(): Promise<ChatRecord[]> {
  const db = await openChatDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll();
    request.onsuccess = () => resolve((request.result as ChatRecord[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}

async function writeChat(chat: ChatRecord) {
  const db = await openChatDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(chat);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const STARTER: Msg[] = [{ role: "assistant", content: "Yo 👋 I’m Sebastian AI. I’m ready. Ask me anything, upload a photo, upload a text document, use voice mode, or enable web search after its provider is configured." }];
const STORAGE_KEY = "sebastian-ai-chat-v2";
const MEMORY_KEY = "sebastian-ai-memory-v1";

function extractSSE(buffer: string) {
  const events = buffer.split("\n\n");
  return { complete: events.slice(0, -1), rest: events.at(-1) ?? "" };
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>(STARTER);
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [web, setWeb] = useState(false);
  const [model, setModel] = useState("auto");
  const [memory, setMemory] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [listening, setListening] = useState(false);
  const [fileName, setFileName] = useState("");
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedMemory = localStorage.getItem(MEMORY_KEY);
        if (savedMemory) setMemory(savedMemory);
        const stored = await readChats();
        if (cancelled) return;
        let available = stored;
        if (!stored.length) {
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy);
            if (Array.isArray(parsed) && parsed.length) {
              const migrated: ChatRecord = { id: crypto.randomUUID(), title: "Migrated chat", messages: parsed.map((m: Msg) => ({ role: m.role, content: m.content })), updatedAt: Date.now() };
              await writeChat(migrated);
              available = [migrated];
            }
          }
        }
        if (available.length) {
          const active = available[0];
          setChats(available.slice(0, CHAT_LIMIT));
          setChatId(active.id);
          setMessages(active.messages.length ? active.messages : STARTER);
        } else {
          const fresh: ChatRecord = { id: crypto.randomUUID(), title: "New chat", messages: STARTER, updatedAt: Date.now() };
          await writeChat(fresh);
          setChats([fresh]);
          setChatId(fresh.id);
        }
      } catch {}
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(MEMORY_KEY, memory); } catch {}
  }, [memory, hydrated]);

  useEffect(() => {
    if (!hydrated || !chatId) return;
    const title = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim().slice(0, 48) || "New chat";
    const safeMessages = messages.slice(-100).map(({ role, content }) => ({ role, content }));
    const record: ChatRecord = { id: chatId, title, messages: safeMessages, updatedAt: Date.now() };
    writeChat(record).then(async () => {
      try { setChats((current) => [record, ...current.filter((c) => c.id !== chatId)].slice(0, CHAT_LIMIT)); } catch {}
    }).catch(() => {});
  }, [messages, chatId, hydrated]);

  const speechSupported = useMemo(() => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window), []);

  async function send() {
    const text = input.trim();
    if ((!text && !imageData) || loading) return;
    const context = memory.trim() ? `

Private user memory supplied by this app:
${memory.slice(0, 5000)}` : "";
    const userMessage: Msg = { role: "user", content: text || "Please analyze this photo.", ...(imageData ? { imageData } : {}) };
    const next = [...messages, { ...userMessage, content: userMessage.content + context }];
    const requestMessages = next.slice(-30);
    setMessages(next);
    setInput("");
    setImageData("");
    setImageName("");
    setLoading(true);
    setMessages((current) => [...current, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages.map(({ role, content }) => ({ role, content })),
          web,
          model,
          imageData: userMessage.imageData || undefined,
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const chunk = await reader.read();
        finished = chunk.done;
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !finished });
        const parsed = extractSSE(buffer);
        buffer = parsed.rest;
        for (const event of parsed.complete) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const payload = JSON.parse(raw);
              const delta = payload?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) {
                setMessages((current) => {
                  const copy = [...current];
                  const last = copy.length - 1;
                  copy[last] = { role: "assistant", content: (copy[last]?.content || "") + delta };
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setMessages((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${message}` };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    const fresh: ChatRecord = { id: crypto.randomUUID(), title: "New chat", messages: STARTER, updatedAt: Date.now() };
    setChatId(fresh.id);
    setMessages(STARTER);
    setInput("");
    setImageData("");
    setImageName("");
    try { await writeChat(fresh); setChats((current) => [fresh, ...current].slice(0, CHAT_LIMIT)); } catch {}
  }

  function loadChat(chat: ChatRecord) {
    if (loading) return;
    setChatId(chat.id);
    setMessages(chat.messages.length ? chat.messages : STARTER);
    setInput("");
    setImageData("");
    setImageName("");
  }

  async function handleFile(file: File) {
    const max = 2_000_000;
    if (file.size > max) {
      setInput("That file is larger than 2 MB. Please choose a smaller text document.");
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setInput(`Please analyze this file (${file.name}) and help me with it:

${text.slice(0, 120_000)}`);
    inputRef.current?.focus();
  }

  function handlePhoto(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setInput("Please choose a JPG, PNG, WEBP, or GIF photo.");
      return;
    }
    if (file.size > 500_000) {
      setInput("That photo is too large. Please choose an image under 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageData(result);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function toggleVoice() {
    if (!speechSupported) {
      setInput((v) => v + (v ? " " : "") + "Voice input is not supported by this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
      setInput(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="hidden w-64 border-r border-zinc-800 p-4 md:flex md:flex-col">
          <div className="mb-5 text-xl font-bold">Sebastian AI</div>
          <button onClick={newChat} className="rounded-xl border border-zinc-700 px-4 py-3 text-left hover:bg-zinc-900">＋ New chat</button>
          <div className="mt-5 text-xs text-zinc-500">Chat history</div>
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {chats.map((chat) => (
              <button key={chat.id} onClick={() => loadChat(chat)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${chat.id === chatId ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}>{chat.title}</button>
            ))}
          </div>
          <div className="mt-4 text-xs text-zinc-500">Capabilities</div>
          <div className="mt-2 space-y-1 text-sm text-zinc-300">
            <div>🌐 Web search (setup pending)</div><div>🖼️ Photo analysis</div><div>📄 Text file analysis</div><div>⚡ Streaming</div><div>💾 Persistent local history</div><div>🎙️ Voice input/output</div><div>🔀 Fast model routing</div>
          </div>
          <label className="mt-4 rounded-xl border border-zinc-800 p-3 text-sm">
            <div className="mb-2 text-xs text-zinc-500">Memory</div>
            <textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="Things you want Sebastian AI to remember on this device..." className="h-20 w-full resize-none bg-transparent outline-none" />
          </label>
        </aside>

        <section className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-zinc-800 p-4">
            <div className="font-semibold md:hidden">Sebastian AI</div><div className="ml-2 max-w-[35%] truncate text-xs text-zinc-500 md:hidden">{chats.find((c) => c.id === chatId)?.title || "New chat"}</div>
            <div className="ml-auto flex items-center gap-2">
              <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs">
                <option value="auto">Auto model</option><option value="sebastian">Sebastian model</option>
              </select>
              <button onClick={() => setWeb((v) => !v)} className={`rounded-lg border px-3 py-2 text-xs ${web ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}>🌐 Web {web ? "ON" : "OFF"}</button>
              <button onClick={newChat} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">New</button>
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-8">
            {messages.map((message, index) => (
              <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 md:max-w-[78%] ${message.role === "user" ? "bg-white text-black" : "border border-zinc-800 bg-zinc-900"}`}>
                  {message.imageData && <img src={message.imageData} alt="Uploaded photo" className="mb-3 max-h-80 max-w-full rounded-xl object-contain" />}
                  {message.content || (loading && index === messages.length - 1 ? "Thinking…" : "")}
                  {message.role === "assistant" && message.content && <button onClick={() => speak(message.content)} className="mt-2 block text-xs text-zinc-500 hover:text-zinc-200">🔊 Read aloud</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 p-3 md:p-5">
            <div className="mx-auto max-w-4xl">
              {(fileName || imageName) && <div className="mb-2 text-xs text-zinc-500">{imageName ? `Photo attached: ${imageName}` : `File attached: ${fileName}`}</div>}
              {imageData && <img src={imageData} alt="Selected photo preview" className="mb-3 max-h-32 rounded-xl object-contain" />}
              <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-2">
                <label className="cursor-pointer rounded-xl px-3 py-2 text-lg hover:bg-zinc-800" title="Upload text file">
                  📎<input type="file" className="hidden" accept=".txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.html,.css,.xml,.log" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
                <label className="cursor-pointer rounded-xl px-3 py-2 text-lg hover:bg-zinc-800" title="Upload photo">
                  🖼️<input ref={imageRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
                </label>
                <button onClick={toggleVoice} className={`rounded-xl px-3 py-2 text-lg ${listening ? "bg-red-500 text-white" : "hover:bg-zinc-800"}`} title="Voice input">🎙️</button>
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Sebastian AI…" className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none" disabled={loading} />
                <button onClick={send} disabled={loading || (!input.trim() && !imageData)} className="rounded-xl bg-white px-5 py-2 font-semibold text-black disabled:opacity-40">{loading ? "…" : "Send"}</button>
              </div>
              <div className="mt-2 text-center text-[11px] text-zinc-600">Web search is optional. Photos are sent with your chat request for image analysis.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

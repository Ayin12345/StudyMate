"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";

type Role = "user" | "assistant";

interface CitedChunk {
  index: number;
  content: string;
  document_title: string;
}

interface Message {
  role: Role;
  content: string;
  citations?: number[];
  chunks?: CitedChunk[];
}

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

function renderAnswer(content: string) {
  const parts = content.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          return (
            <sup
              key={i}
              className="inline-flex items-center justify-center w-4 h-4 text-xs font-bold bg-blue-100 text-blue-700 rounded-full mx-0.5"
            >
              {match[1]}
            </sup>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleSet, setTitleSet] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    setMessages([]);
    setTitleSet(false);
    fetch(`/api/messages?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then(({ messages: loaded }) => {
        if (Array.isArray(loaded) && loaded.length > 0) {
          setMessages(loaded);
          setTitleSet(true);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || !sessionId) return;
    const userId = getUserId();
    if (!userId) return;

    const optimistic: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setLoading(true);
    setError(null);

    const isFirstMessage = !titleSet;
    if (isFirstMessage) setTitleSet(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userId, content: text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      const { reply, citations, chunks } = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, citations, chunks },
      ]);

      if (isFirstMessage) {
        window.dispatchEvent(new CustomEvent("session-titled", { detail: { sessionId } }));
      }
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && !loading && (
          <p className="text-center text-gray-400 mt-16 text-sm">
            Ask anything — your StudyMate is ready.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-900"
              }`}
            >
              {msg.role === "assistant" ? renderAnswer(msg.content) : msg.content}
            </div>

            {msg.role === "assistant" && msg.chunks && msg.chunks.length > 0 && (
              <div className="mt-2 space-y-2 w-full max-w-[70%]">
                {msg.chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center w-4 h-4 text-xs font-bold bg-blue-100 text-blue-700 rounded-full shrink-0">
                        {chunk.index}
                      </span>
                      <span className="font-semibold text-gray-700">{chunk.document_title}</span>
                    </div>
                    <p className="text-gray-500 leading-relaxed line-clamp-3">{chunk.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-3 items-end">
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] max-h-40"
            placeholder="Message StudyMate… (Enter to send, Shift+Enter for newline)"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

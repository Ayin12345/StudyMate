"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowUpIcon, Globe } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, searchLinks } from "@/lib/utils";

type Role = "user" | "assistant";

interface CitedChunk {
  index: number;
  content: string;
  document_title: string;
}

interface ResourceSuggestion {
  text: string;
  query: string;
}

interface Message {
  role: Role;
  content: string;
  citations?: number[];
  chunks?: CitedChunk[];
  resources?: ResourceSuggestion[];
  notFoundInNotes?: boolean;
  question?: string;
}

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-base font-semibold text-white mt-3 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-white mt-3 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-white mt-3 mb-1.5 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold text-neutral-200 mt-2 mb-1 first:mt-0">{children}</h4>
  ),
  hr: () => <hr className="my-3 border-orange-900/20" />,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-300 underline underline-offset-2 hover:text-orange-200">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-orange-900/40 pl-3 italic text-neutral-400 mb-2">{children}</blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    if (!className && typeof children === "string") {
      const citeMatch = children.match(/^@@cite:(\d+)@@$/);
      if (citeMatch) {
        return (
          <sup className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold bg-orange-500/15 text-orange-300 rounded-full mx-0.5 align-super">
            {citeMatch[1]}
          </sup>
        );
      }
    }
    return (
      <code className={cn(
        className ? "block font-mono text-[13px]" : "px-1 py-0.5 rounded bg-white/10 text-orange-200 text-[13px] font-mono",
        className
      )}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 rounded-lg bg-black/40 border border-orange-900/20 p-3 overflow-x-auto">{children}</pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-left font-semibold text-neutral-300 px-3 py-1.5 border-b border-orange-900/30">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 border-t border-white/5 text-neutral-300">{children}</td>
  ),
};

function renderAnswer(content: string) {
  // Wrap [N] citation markers in inline code so the `code` renderer can turn them into badges
  const withCitations = content.replace(/\[(\d+)\]/g, (_, n) => `\`@@cite:${n}@@\``);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {withCitations}
    </ReactMarkdown>
  );
}

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleSet, setTitleSet] = useState(false);
  const [subject, setSubject] = useState<string | null>(null);
  const [allowExternal, setAllowExternal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "52px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setMessages([]);
    setTitleSet(false);
    setSubject(null);
    fetch(`/api/messages?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then(({ messages: loaded }) => {
        if (Array.isArray(loaded) && loaded.length > 0) {
          setMessages(loaded.map((m: { role: Role; content: string; chunks?: CitedChunk[] }) => ({
            role: m.role,
            content: m.content,
            chunks: m.chunks ?? undefined,
          })));
          setTitleSet(true);
          return;
        }

        const pendingKey = `studymate_pending_${sessionId}`;
        const pending = sessionStorage.getItem(pendingKey);
        if (pending) {
          sessionStorage.removeItem(pendingKey);
          try {
            const { text, allowExternal: pendingAllowExternal } = JSON.parse(pending) as {
              text: string;
              allowExternal: boolean;
            };
            setAllowExternal(pendingAllowExternal);
            sendMessage(text, pendingAllowExternal);
          } catch {
            sendMessage(pending);
          }
        }
      })
      .catch(() => {});
    fetch(`/api/sessions?id=${sessionId}`)
      .then((r) => r.json())
      .then(({ session }) => {
        if (session) setSubject(session.subject ?? null);
      })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(overrideText?: string, overrideAllowExternal?: boolean) {
    const text = (overrideText ?? input).trim();
    if (!text || loading || !sessionId) return;
    const userId = getUserId();
    if (!userId) return;

    const optimistic: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, optimistic, { role: "assistant", content: "" }]);
    if (overrideText === undefined) setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "52px";
    setLoading(true);
    setError(null);

    const isFirstMessage = !titleSet;
    if (isFirstMessage) setTitleSet(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userId, content: text, allowExternal: overrideAllowExternal ?? allowExternal }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const META_MARKER = "\n␞STUDYMATE_META␞";
      let full = "";
      let target = ""; // visible text received so far
      let displayed = ""; // visible text rendered so far (catches up gradually)
      let streamDone = false;

      // Smooth out bursty network chunks into a steady typing animation —
      // reveal a few characters per tick, with the step size scaling up if
      // a backlog builds (so we never fall meaningfully behind the stream).
      const typingDone = new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (displayed.length < target.length) {
            const backlog = target.length - displayed.length;
            const step = Math.max(1, Math.ceil(backlog / 6));
            displayed = target.slice(0, displayed.length + step);
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: displayed };
              return next;
            });
          }
          if (displayed.length >= target.length && streamDone) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });

        const idx = full.indexOf(META_MARKER);
        target = idx === -1 ? full : full.slice(0, idx);
      }
      full += decoder.decode();
      streamDone = true;
      await typingDone;

      const idx = full.indexOf(META_MARKER);
      const answer = idx === -1 ? full : full.slice(0, idx);
      let meta: {
        citations?: number[];
        chunks?: CitedChunk[];
        resources?: ResourceSuggestion[];
        notFoundInNotes?: boolean;
        title?: string | null;
        shouldGenerateReport?: boolean;
        error?: boolean;
      } = {};
      if (idx !== -1) {
        try {
          meta = JSON.parse(full.slice(idx + META_MARKER.length));
        } catch {
          // Ignore malformed meta — answer text is still valid
        }
      }

      if (meta.error) throw new Error("Failed to get a response from Claude.");

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: answer,
          citations: meta.citations,
          chunks: meta.chunks,
          resources: meta.resources,
          notFoundInNotes: meta.notFoundInNotes,
          question: text,
        };
        return next;
      });

      if (isFirstMessage && meta.title) {
        window.dispatchEvent(new CustomEvent("session-titled", { detail: { sessionId, title: meta.title } }));
      }

      if (meta.shouldGenerateReport) {
        fetch("/api/progress/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
          .then((r) => { if (r.ok) window.dispatchEvent(new CustomEvent("report-ready")); })
          .catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => prev.slice(0, -2));
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
    <div className="relative flex flex-col h-full bg-[#0a0400] overflow-hidden">
      {/* Subtle ambient gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[35%]"
          style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(100,20,5,0.24) 0%, transparent 70%)" }} />
        <div className="absolute top-0 right-0 w-[40%] h-[40%]"
          style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(80,15,5,0.13) 0%, transparent 65%)" }} />
        <div className="absolute top-1/3 left-0 w-[30%] h-[40%]"
          style={{ background: "radial-gradient(ellipse at 0% 50%, rgba(60,10,5,0.1) 0%, transparent 70%)" }} />
      </div>

      {/* Scope indicator */}
      <div className="relative z-10 px-8 pt-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 border border-orange-900/25 text-orange-300/80">
            Scope: {subject ?? "All documents"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-10">
          {messages.length === 0 && !loading && (
            <p className="text-center text-neutral-700 mt-16 text-sm">
              Ask anything — your StudyMate is ready.
            </p>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                /* User: right-aligned bubble */
                <div className="flex justify-end">
                  <div className="max-w-[75%] bg-red-950/45 border border-orange-900/20 text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* Assistant: plain text, no bubble */
                <div className="space-y-4">
                  <div className="text-neutral-200 text-sm leading-relaxed">
                    {renderAnswer(msg.content)}
                  </div>

                  {msg.chunks && msg.chunks.length > 0 && (
                    <div className="space-y-2">
                      {msg.chunks.map((chunk) => (
                        <div
                          key={chunk.index}
                          className="border border-orange-900/20 rounded-xl p-3 bg-orange-950/10 text-xs"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 text-xs font-semibold bg-white/5 text-orange-300/70 rounded-full shrink-0">
                              {chunk.index}
                            </span>
                            <span className="font-medium text-neutral-400">{chunk.document_title}</span>
                          </div>
                          <p className="text-neutral-600 leading-relaxed line-clamp-3">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.resources && msg.resources.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Further reading
                      </p>
                      {msg.resources.map((res, i) => (
                        <div
                          key={i}
                          className="border border-orange-900/20 rounded-xl p-3 bg-orange-950/10 text-xs"
                        >
                          <p className="text-neutral-400 mb-1.5">{res.text}</p>
                          <div className="flex flex-wrap gap-2">
                            {searchLinks(res.query).map((link) => (
                              <a
                                key={link.label}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-full border border-orange-900/25 bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-400 hover:text-orange-200/80 hover:border-orange-500/30 transition-colors"
                              >
                                {link.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.notFoundInNotes && msg.question && (
                    <button
                      onClick={() => {
                        setAllowExternal(true);
                        sendMessage(msg.question, true);
                      }}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-orange-900/25 bg-white/[0.03] px-3 py-1.5 text-xs text-orange-300/80 hover:text-orange-200 hover:border-orange-500/30 transition-colors disabled:opacity-40"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Try again with outside resources
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && messages[messages.length - 1]?.content === "" && (
            <div className="text-neutral-600 text-sm">Thinking…</div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2 text-sm text-red-400">
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-2">
        <div className="max-w-5xl mx-auto">
          <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-orange-900/25">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Message StudyMate…"
              rows={1}
              style={{ overflow: "hidden", height: "52px" }}
              className="w-full px-6 py-4 resize-none rounded-t-2xl bg-transparent text-white text-base leading-relaxed focus:outline-none placeholder:text-neutral-600"
            />
            <div className="flex items-center justify-between px-5 pb-4">
              <button
                onClick={() => setAllowExternal((prev) => !prev)}
                title={allowExternal ? "Outside resources: on — Claude may use knowledge beyond your notes" : "Outside resources: off — answers limited to your notes"}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  allowExternal
                    ? "text-orange-300 bg-orange-500/10"
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                <Globe className="w-5 h-5" />
              </button>

              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                  input.trim() && !loading
                    ? "bg-white text-black hover:bg-neutral-200"
                    : "bg-white/10 text-neutral-600 cursor-not-allowed"
                )}
              >
                <ArrowUpIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

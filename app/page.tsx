"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUpIcon, Paperclip, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { StudyDocument } from "@/lib/types";

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [allowExternal, setAllowExternal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "60px";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    fetch(`/api/documents?userId=${userId}`)
      .then((r) => r.json())
      .then(({ documents }) => {
        if (!Array.isArray(documents)) return;
        const supertags = new Set<string>();
        (documents as StudyDocument[]).forEach((doc) => {
          if (doc.supertag) supertags.add(doc.supertag);
        });
        setSubjects(Array.from(supertags).sort());
      })
      .catch(() => {});
  }, []);

  async function handleSend() {
    if (!message.trim() || loading) return;
    const userId = getUserId();
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject: selectedSubject }),
      });
      const { session } = await res.json();
      sessionStorage.setItem(
        `studymate_pending_${session.id}`,
        JSON.stringify({ text: message.trim(), allowExternal })
      );
      router.push(`/chat/${session.id}`);
    } catch {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="relative flex flex-col h-full bg-[#080300] overflow-hidden">
      {/* Glowing orb */}
      <div
        className="absolute inset-x-0 bottom-0 h-full pointer-events-none opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 160% 130% at 50% 105%, #5c1206 0%, #4a0f06 10%, #3d0e07 22%, #2a1005 34%, #1a0d05 46%, #120805 57%, #0a0503 67%, transparent 82%)",
        }}
      />

      {/* Title + input grouped and centered together */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 gap-32 px-4 pb-24">
        <div className="text-center">
          <h1 className="text-5xl font-semibold text-white drop-shadow-sm tracking-tight">
            StudyMate
          </h1>
          <p className="mt-3 text-neutral-400 text-base">
            Your RAG-powered study assistant.
          </p>
        </div>

        <div className="w-full max-w-3xl">
          {subjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 px-1">
              <button
                onClick={() => setSelectedSubject(null)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                  selectedSubject === null
                    ? "bg-orange-500/10 border-orange-500/20 text-orange-200/70"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                )}
              >
                All documents
              </button>
              {subjects.map((subject) => (
                <button
                  key={subject}
                  onClick={() => setSelectedSubject(subject)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                    selectedSubject === subject
                      ? "bg-orange-500/10 border-orange-500/20 text-orange-200/70"
                      : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                  )}
                >
                  {subject}
                </button>
              ))}
            </div>
          )}
          <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-orange-900/25">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask your StudyMate anything…"
              rows={1}
              style={{ overflow: "hidden", height: "60px" }}
              className={cn(
                "w-full px-5 py-4 resize-none rounded-t-2xl",
                "bg-transparent text-white text-base",
                "focus:outline-none",
                "placeholder:text-neutral-500"
              )}
            />

            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => router.push("/documents")}
                  title="Go to Documents"
                  className="text-neutral-500 hover:text-white transition-colors p-1.5 rounded-lg"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
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
              </div>

              <button
                onClick={handleSend}
                disabled={!message.trim() || loading}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                  message.trim() && !loading
                    ? "bg-white text-black hover:bg-neutral-200"
                    : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
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

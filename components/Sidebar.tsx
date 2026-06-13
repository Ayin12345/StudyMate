"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, FileText, TrendingUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  title: string | null;
  subject?: string | null;
  created_at: string;
}

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

export default function Sidebar() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [hasNewReport, setHasNewReport] = useState(false);
  const prevIdsRef = useRef<Set<string> | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const fetchSessions = useCallback((animate = false) => {
    const userId = getUserId();
    if (!userId) return;
    fetch(`/api/sessions?userId=${userId}`)
      .then((r) => r.json())
      .then(({ sessions: loaded }) => {
        if (!Array.isArray(loaded)) return;
        const titled = loaded.filter((s: Session) => s.title !== null);

        if (prevIdsRef.current === null) {
          prevIdsRef.current = new Set(titled.map((s: Session) => s.id));
          setSessions(titled);
          return;
        }

        const newIds = titled
          .map((s: Session) => s.id)
          .filter((id: string) => !prevIdsRef.current!.has(id));

        prevIdsRef.current = new Set(titled.map((s: Session) => s.id));
        setSessions(titled);

        if (animate && newIds.length > 0) {
          setAnimatingIds((prev) => new Set([...prev, ...newIds]));
          setTimeout(() => {
            setAnimatingIds((prev) => {
              const next = new Set(prev);
              newIds.forEach((id: string) => next.delete(id));
              return next;
            });
          }, 500);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions(false);
  }, [fetchSessions, pathname]);

  useEffect(() => {
    const handler = () => setHasNewReport(true);
    window.addEventListener("report-ready", handler);
    return () => window.removeEventListener("report-ready", handler);
  }, []);

  useEffect(() => {
    if (pathname === "/progress") setHasNewReport(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId: newId, title } = (e as CustomEvent<{ sessionId: string; title: string }>).detail;
      setSessions((prev) => {
        if (prev.find((s) => s.id === newId)) {
          return prev.map((s) => (s.id === newId ? { ...s, title } : s));
        }
        return [{ id: newId, title, created_at: new Date().toISOString() }, ...prev];
      });
      prevIdsRef.current?.add(newId);
      setAnimatingIds((prev) => new Set([...prev, newId]));
      setTimeout(() => {
        setAnimatingIds((prev) => {
          const next = new Set(prev);
          next.delete(newId);
          return next;
        });
      }, 500);
    };
    window.addEventListener("session-titled", handler);
    return () => window.removeEventListener("session-titled", handler);
  }, []);

  async function handleDeleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    prevIdsRef.current?.delete(id);
    if (pathname === `/chat/${id}`) router.push("/");
    await fetch(`/api/sessions?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  function handleNewChat() {
    router.push("/");
  }

  return (
    <aside className="w-72 shrink-0 bg-[#0d0d12] flex flex-col">
      {/* App name */}
      <div className="px-7 pt-6 pb-6">
        <Link href="/" className="text-lg font-semibold text-white hover:opacity-70 transition-opacity">
          StudyMate
        </Link>
      </div>

      {/* Nav links — New chat, Documents, Progress all same spacing */}
      <nav className="px-3 space-y-1">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          New chat
        </button>

        <Link
          href="/documents"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors",
            pathname === "/documents"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
          )}
        >
          <FileText className="w-4 h-4 shrink-0" />
          Documents
        </Link>

        <Link
          href="/progress"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors",
            pathname === "/progress"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
          )}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span className="flex-1">Progress</span>
          {hasNewReport && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
        </Link>
      </nav>

      {/* Recents */}
      {sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto mt-5 px-3">
          <p className="px-4 pb-1 text-xs text-neutral-500 font-medium">Recents</p>
          <ul className="space-y-0.5">
            {sessions.map((s) => {
              const isActive = pathname === `/chat/${s.id}`;
              const isNew = animatingIds.has(s.id);
              return (
                <li key={s.id} className={`group relative ${isNew ? "session-enter" : ""}`}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={cn(
                      "flex items-center gap-3 pr-7 px-4 py-2.5 rounded-xl text-sm transition-colors",
                      isActive
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                    )}
                    title={s.title ?? ""}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
                    <span className="truncate flex-1">{s.title}</span>
                    {s.subject && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700/60 text-neutral-400">
                        {s.subject}
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={() => handleDeleteSession(s.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-opacity text-base leading-none px-0.5"
                    title="Delete chat"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sessions.length === 0 && <div className="flex-1" />}
    </aside>
  );
}

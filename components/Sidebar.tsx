"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface Session {
  id: string;
  title: string | null;
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
          // First load — seed ref, no animation
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

  // Initial load
  useEffect(() => {
    fetchSessions(false);
  }, [fetchSessions, pathname]);

  // Listen for title-generated event
  useEffect(() => {
    const handler = () => fetchSessions(true);
    window.addEventListener("session-titled", handler);
    return () => window.removeEventListener("session-titled", handler);
  }, [fetchSessions]);

  async function handleNewChat() {
    const userId = getUserId();
    if (!userId) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const { session } = await res.json();
    router.push(`/chat/${session.id}`);
  }

  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col">
      {/* App name */}
      <div className="px-4 pt-5 pb-3">
        <Link href="/" className="text-lg font-semibold text-gray-900 hover:opacity-70 transition-opacity">
          StudyMate
        </Link>
      </div>

      {/* Top nav */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
        >
          New chat
        </button>

        <Link
          href="/documents"
          className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/documents" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Documents
        </Link>

        <span className="flex items-center px-3 py-2 rounded-lg text-sm text-gray-400 cursor-not-allowed select-none">
          Progress
        </span>
      </nav>

      {/* Recents */}
      {sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto mt-4 px-2">
          <p className="px-3 py-1 text-xs text-gray-400 font-medium">Recents</p>
          <ul className="mt-1 space-y-0.5">
            {sessions.map((s) => {
              const isActive = pathname === `/chat/${s.id}`;
              const isNew = animatingIds.has(s.id);
              return (
                <li key={s.id} className={isNew ? "session-enter" : ""}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={`block px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      isActive ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    title={s.title ?? ""}
                  >
                    {s.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

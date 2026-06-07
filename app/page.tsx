"use client";

import { useRouter } from "next/navigation";

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

export default function HomePage() {
  const router = useRouter();

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
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-gray-900">StudyMate</h1>
        <p className="mt-2 text-gray-500">Your RAG-powered study assistant.</p>
      </div>
      <button
        onClick={handleNewChat}
        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        New Chat
      </button>
    </div>
  );
}

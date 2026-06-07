import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyMate",
  description: "RAG-based study assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-gray-50 text-gray-900 antialiased">
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-semibold">StudyMate</h1>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            <Link
              href="/"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Chat
            </Link>
            <Link
              href="/documents"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Documents
            </Link>
            <span className="block px-3 py-2 rounded-md text-sm text-gray-400 cursor-not-allowed">
              Progress
            </span>
          </nav>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </body>
    </html>
  );
}

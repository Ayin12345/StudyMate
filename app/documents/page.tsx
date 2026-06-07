"use client";

import { useState, useEffect, useRef } from "react";
import type { StudyDocument } from "@/lib/types";

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = getUserId();
    sessionIdRef.current = userId;

    fetch(`/api/documents?userId=${userId}`)
      .then((r) => r.json())
      .then(({ documents: loaded }) => {
        if (Array.isArray(loaded)) setDocuments(loaded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractedText(null);
    setScanned(false);
    setError(null);
    setDupWarning(false);
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setSubject("");

    if (file.name.toLowerCase().endsWith(".pdf")) {
      setExtracting(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        const data = await res.json();
        if (data.scanned) {
          setScanned(true);
        } else {
          setExtractedText(data.text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed.");
      } finally {
        setExtracting(false);
      }
    } else {
      const text = await file.text();
      setExtractedText(text);
    }
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    setDupWarning(documents.some((d) => d.title.toLowerCase() === val.trim().toLowerCase()));
  }

  async function handleSave() {
    if (!extractedText?.trim() || !subject.trim() || !title.trim() || !sessionIdRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: sessionIdRef.current,
          subject: subject.trim(),
          title: title.trim(),
          text: extractedText,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const { document: saved } = await res.json();
      setDocuments((prev) => [...prev, saved]);
      setExtractedText(null);
      setScanned(false);
      setSubject("");
      setTitle("");
      setDupWarning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save document.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <h2 className="text-xl font-semibold">Documents</h2>

        {/* Upload section */}
        <section className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload file <span className="text-gray-400 font-normal">(.pdf, .md, .txt)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.txt"
              onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          {extracting && <p className="text-sm text-gray-500">Extracting text…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {scanned && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 space-y-2">
              <p className="text-sm text-yellow-800 font-medium">
                This PDF appears to be scanned (no text layer detected).
              </p>
              <p className="text-sm text-yellow-700">Please paste the document text below instead.</p>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
                placeholder="Paste your text here…"
                onChange={(e) => setExtractedText(e.target.value || null)}
              />
            </div>
          )}

          {extractedText !== null && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Linear Algebra"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Week 3 Notes"
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dupWarning ? "border-yellow-400" : "border-gray-300"
                    }`}
                  />
                </div>
              </div>

              {dupWarning && (
                <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  A document with this title already exists. You can still save — it will be added as a separate copy.
                </p>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Extracted text preview</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {extractedText.slice(0, 2000)}
                  {extractedText.length > 2000 ? "\n…(truncated)" : ""}
                </pre>
              </div>

              <button
                onClick={handleSave}
                disabled={!subject.trim() || !title.trim() || saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving…" : "Save document"}
              </button>
            </div>
          )}
        </section>

        {/* Saved documents list */}
        <section>
          {loading ? (
            <p className="text-sm text-gray-400">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-400">No documents saved yet.</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Saved documents ({documents.length})
              </h3>
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="rounded-lg border border-gray-200 bg-white text-sm">
                    <div className="flex items-center justify-between px-4 py-3">
                      <button
                        onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        <span className="text-gray-400 text-xs">{expandedId === doc.id ? "▾" : "▸"}</span>
                        <span className="font-medium text-gray-900 truncate">{doc.title}</span>
                        <span className="text-xs text-gray-400 shrink-0">{doc.subject}</span>
                      </button>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(doc.date).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {expandedId === doc.id && (
                      <div className="border-t border-gray-100 px-4 py-3">
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {doc.text.slice(0, 3000)}
                          {doc.text.length > 3000 ? "\n…(truncated)" : ""}
                        </pre>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

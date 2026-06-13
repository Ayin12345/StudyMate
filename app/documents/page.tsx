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
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [supertag, setSupertag] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userIdRef = useRef<string | null>(null);
  const backfillRanRef = useRef(false);

  useEffect(() => {
    const userId = getUserId();
    userIdRef.current = userId;

    fetch(`/api/documents?userId=${userId}`)
      .then((r) => r.json())
      .then(({ documents: loaded }) => {
        if (Array.isArray(loaded)) setDocuments(loaded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Silently backfill AI tags for documents saved before auto-tagging existed.
  useEffect(() => {
    if (loading || backfillRanRef.current) return;
    const userId = userIdRef.current;
    if (!userId) return;
    const untagged = documents.filter((d) => !d.supertag);
    if (untagged.length === 0) return;
    backfillRanRef.current = true;

    untagged.forEach(async (doc) => {
      try {
        const res = await fetch("/api/generate-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, text: doc.text }),
        });
        const { supertag: generatedSupertag, tags: generatedTags } = await res.json();
        const finalSupertag = typeof generatedSupertag === "string" && generatedSupertag ? generatedSupertag : "General";
        const finalTags = Array.isArray(generatedTags) && generatedTags.length > 0 ? generatedTags : ["General"];

        const patchRes = await fetch(`/api/documents?id=${doc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supertag: finalSupertag, tags: finalTags }),
        });
        if (!patchRes.ok) return;

        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, supertag: finalSupertag, tags: finalTags } : d))
        );
      } catch {
        // Non-fatal — document just stays untagged for now
      }
    });
  }, [loading, documents]);

  async function generateTags(text: string) {
    const userId = userIdRef.current;
    if (!userId) return;
    setGeneratingTags(true);
    try {
      const res = await fetch("/api/generate-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text }),
      });
      const { supertag: generatedSupertag, tags: generated } = await res.json();
      const finalSupertag = typeof generatedSupertag === "string" && generatedSupertag ? generatedSupertag : "General";
      const finalTags = Array.isArray(generated) && generated.length > 0 ? generated : ["General"];
      setSupertag(finalSupertag);
      setTags(finalTags);
    } catch {
      setSupertag("General");
      setTags(["General"]);
    } finally {
      setGeneratingTags(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractedText(null);
    setScanned(false);
    setError(null);
    setDupWarning(false);
    setSupertag(null);
    setTags([]);
    setTitle(file.name.replace(/\.[^.]+$/, ""));

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
          generateTags(data.text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed.");
      } finally {
        setExtracting(false);
      }
    } else {
      const text = await file.text();
      setExtractedText(text);
      generateTags(text);
    }
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    setDupWarning(documents.some((d) => d.title.toLowerCase() === val.trim().toLowerCase()));
  }

  async function handleSave() {
    if (!extractedText?.trim() || !supertag || tags.length === 0 || !title.trim() || !userIdRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userIdRef.current,
          supertag,
          tags,
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
      setSupertag(null);
      setTags([]);
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
      if (viewingId === id) setViewingId(null);
    }
  }

  const viewingDoc = documents.find((d) => d.id === viewingId) ?? null;

  const subjects = Array.from(new Set(documents.map((d) => d.supertag).filter((s): s is string => !!s))).sort();
  const filteredDocuments = subjectFilter ? documents.filter((d) => d.supertag === subjectFilter) : documents;

  return (
    <div className="relative flex flex-col h-full bg-[#0a0400] overflow-hidden">
      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[35%]"
          style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(100,20,5,0.24) 0%, transparent 70%)" }} />
        <div className="absolute top-0 right-0 w-[40%] h-[40%]"
          style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(80,15,5,0.13) 0%, transparent 65%)" }} />
        <div className="absolute top-1/3 left-0 w-[30%] h-[40%]"
          style={{ background: "radial-gradient(ellipse at 0% 50%, rgba(60,10,5,0.1) 0%, transparent 70%)" }} />
      </div>

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Documents</h1>
            <p className="mt-1 text-neutral-400 text-sm">
              Upload your notes — subjects and tags are generated automatically.
            </p>
          </div>

          {/* Upload section */}
          <section className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Upload file <span className="text-neutral-600 font-normal">(.pdf, .md, .txt)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.txt"
                onChange={handleFile}
                className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-white/10 file:text-neutral-200 hover:file:bg-white/20 file:transition-colors cursor-pointer"
              />
            </div>

            {extracting && <p className="text-sm text-neutral-500">Extracting text…</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}

            {scanned && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 space-y-2">
                <p className="text-sm text-yellow-200/90 font-medium">
                  This PDF appears to be scanned (no text layer detected).
                </p>
                <p className="text-sm text-yellow-200/60">Please paste the document text below instead.</p>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  rows={6}
                  placeholder="Paste your text here…"
                  onChange={(e) => {
                    const val = e.target.value || null;
                    setExtractedText(val);
                    if (val) generateTags(val);
                  }}
                />
              </div>
            )}

            {extractedText !== null && (
              <div className="space-y-4">
                {/* AI-generated subject & tags */}
                <div>
                  <p className="text-xs font-medium text-neutral-400 mb-2">
                    AI-generated subject &amp; tags{" "}
                    {generatingTags && (
                      <span className="text-neutral-600 font-normal">generating…</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {supertag && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 border border-orange-500/20 text-orange-200/70">
                        {supertag}
                      </span>
                    )}
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Week 3 Notes"
                    className={`w-full rounded-lg border px-3 py-2 text-sm bg-black/20 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 ${
                      dupWarning ? "border-yellow-500/40" : "border-white/10"
                    }`}
                  />
                </div>

                {dupWarning && (
                  <p className="text-sm text-yellow-200/70 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    A document with this title already exists. You can still save — it will be added as a separate copy.
                  </p>
                )}

                <div>
                  <p className="text-sm font-medium text-neutral-300 mb-1.5">Extracted text preview</p>
                  <pre className="bg-black/20 border border-white/10 rounded-lg p-3 text-xs text-neutral-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {extractedText.slice(0, 2000)}
                    {extractedText.length > 2000 ? "\n…(truncated)" : ""}
                  </pre>
                </div>

                <button
                  onClick={handleSave}
                  disabled={!title.trim() || !supertag || tags.length === 0 || saving || generatingTags}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:bg-white/10 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving…" : "Save document"}
                </button>
              </div>
            )}
          </section>

          {/* Saved documents */}
          <section>
            {loading ? (
              <p className="text-sm text-neutral-600">Loading documents…</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-neutral-600">No documents saved yet.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-neutral-300">
                    Saved documents ({filteredDocuments.length})
                  </h2>
                  {subjects.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => setSubjectFilter(null)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                          subjectFilter === null
                            ? "bg-orange-500/15 border border-orange-500/30 text-orange-200"
                            : "bg-white/5 border border-white/10 text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        All
                      </button>
                      {subjects.map((subject) => (
                        <button
                          key={subject}
                          onClick={() => setSubjectFilter(subject)}
                          className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                            subjectFilter === subject
                              ? "bg-orange-500/15 border border-orange-500/30 text-orange-200"
                              : "bg-white/5 border border-white/10 text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          {subject}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {filteredDocuments.length === 0 ? (
                  <p className="text-sm text-neutral-600">No documents match this filter.</p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setViewingId(doc.id)}
                      className="group relative flex flex-col gap-3 rounded-2xl border border-orange-900/20 bg-black/20 backdrop-blur-md p-5 cursor-pointer hover:border-orange-900/35 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-neutral-100 text-sm leading-snug line-clamp-2">
                          {doc.title}
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-opacity text-base leading-none shrink-0"
                          aria-label={`Delete ${doc.title}`}
                        >
                          ×
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {doc.supertag && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/10 border border-orange-500/20 text-orange-200/70">
                            {doc.supertag}
                          </span>
                        )}
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-neutral-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">
                        {doc.text.slice(0, 220)}
                      </p>

                      <span className="text-[10px] text-neutral-600 mt-auto pt-1">
                        {new Date(doc.date).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Document detail modal */}
      {viewingDoc && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={() => setViewingId(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-orange-900/25 bg-[#120805] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-white leading-snug">{viewingDoc.title}</h2>
              <button
                onClick={() => setViewingId(null)}
                className="text-neutral-500 hover:text-neutral-300 transition-colors text-xl leading-none shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {viewingDoc.supertag && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 border border-orange-500/20 text-orange-200/70">
                  {viewingDoc.supertag}
                </span>
              )}
              {viewingDoc.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-neutral-400"
                >
                  {tag}
                </span>
              ))}
              <span className="text-xs text-neutral-600 ml-auto">
                {new Date(viewingDoc.date).toLocaleDateString()}
              </span>
            </div>

            <pre className="text-xs text-neutral-400 whitespace-pre-wrap leading-relaxed">
              {viewingDoc.text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

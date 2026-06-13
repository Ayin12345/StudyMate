"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchLinks } from "@/lib/utils";

interface SupertagStat {
  supertag: string;
  count: number;
  confusionRate: number;
  noAnswerRate: number;
  lastStudied: string;
  topics: { topic: string; count: number }[];
}

interface DailyActivity {
  date: string;
  count: number;
}

interface ProgressData {
  totalQuestions: number;
  activeDays: number;
  supertags: SupertagStat[];
  dailyActivity: DailyActivity[];
}

interface ResourceSuggestion {
  text: string;
  query: string;
}

interface SupertagReport {
  supertag: string;
  summary: string;
  focusAreas: string[];
  resources: ResourceSuggestion[];
}

interface ParsedReport {
  overall: string;
  supertags: SupertagReport[];
}

interface Report {
  id: string;
  status: "generating" | "ready";
  report_text: string | null;
  events_included_count: number;
  created_at: string;
  completed_at: string | null;
}

function getUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^| )studymate_user_id=([^;]+)/);
  return match ? match[2] : null;
}

function parseReport(report: Report | null): ParsedReport | null {
  if (!report?.report_text) return null;
  try {
    const parsed = JSON.parse(report.report_text);
    if (typeof parsed.overall === "string" && Array.isArray(parsed.supertags)) {
      return parsed as ParsedReport;
    }
  } catch {
    // Legacy plain-text report — show as the overall summary, no per-subject breakdown
    return { overall: report.report_text, supertags: [] };
  }
  return { overall: report.report_text, supertags: [] };
}

// ── Donut chart ────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "rgba(251,146,60,0.9)",   // orange-400 (light)
  "rgba(220,38,38,0.85)",   // red-600
  "rgba(217,119,6,0.85)",   // amber-600
  "rgba(124,45,18,0.85)",   // orange-900 (deep brown)
  "rgba(254,215,170,0.85)", // orange-200 (pale)
  "rgba(248,113,113,0.85)", // red-400
  "rgba(120,53,15,0.85)",   // amber-900
  "rgba(249,115,22,0.85)",  // orange-500
];

function DonutChart({ data }: { data: { supertag: string; count: number }[] }) {
  const total = data.reduce((s, t) => s + t.count, 0);
  if (total === 0 || data.length === 0) return null;

  const CX = 80, CY = 80, R = 60, r = 38;

  if (data.length === 1) {
    return (
      <div className="flex items-center gap-6">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={CX} cy={CY} r={R} fill={CHART_COLORS[0]} />
          <circle cx={CX} cy={CY} r={r} fill="#170b06" />
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize="22" fontWeight="600" fill="#f5f5f4">
            {total}
          </text>
          <text x={CX} y={CY + 16} textAnchor="middle" fontSize="11" fill="#a8a29e">
            questions
          </text>
        </svg>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[0] }} />
            <span className="text-neutral-300">{data[0].supertag}</span>
            <span className="text-neutral-500 ml-auto pl-8">100%</span>
          </li>
        </ul>
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const slices = data.map((t, i) => {
    const start = angle;
    const sweep = (t.count / total) * 2 * Math.PI;
    angle += sweep;
    const end = angle;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end),   y2 = CY + R * Math.sin(end);
    const ix1 = CX + r * Math.cos(start), iy1 = CY + r * Math.sin(start);
    const ix2 = CX + r * Math.cos(end),   iy2 = CY + r * Math.sin(end);
    return {
      d: `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix2},${iy2} A${r},${r},0,${large},0,${ix1},${iy1}Z`,
      color: CHART_COLORS[i % CHART_COLORS.length],
      pct: Math.round((t.count / total) * 100),
      label: t.supertag,
    };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        <circle cx={CX} cy={CY} r={r} fill="#170b06" />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="22" fontWeight="600" fill="#f5f5f4">
          {total}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize="11" fill="#a8a29e">
          questions
        </text>
      </svg>
      <ul className="space-y-2 min-w-0">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-neutral-300 truncate">{s.label}</span>
            <span className="text-neutral-500 ml-auto pl-6 shrink-0">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Daily activity chart ────────────────────────────────────────────────────

function DailyActivityChart({ data }: { data: DailyActivity[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d) => {
        const date = new Date(d.date + "T00:00:00");
        const heightPct = d.count === 0 ? 0 : Math.max(8, (d.count / max) * 100);
        const isToday = d.date === today;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full min-w-0">
            <span className="text-[10px] text-neutral-500 leading-none">{d.count > 0 ? d.count : ""}</span>
            <div
              className={`w-full rounded-sm transition-all ${
                isToday ? "bg-orange-400" : "bg-orange-500/40"
              }`}
              style={{ height: `${heightPct}%` }}
              title={`${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${d.count} question${d.count === 1 ? "" : "s"}`}
            />
            <span className="text-[9px] text-neutral-600 leading-none">
              {date.toLocaleDateString(undefined, { day: "numeric" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Subtopic bars ────────────────────────────────────────────────────────────

function SubtopicBars({ topics }: { topics: { topic: string; count: number }[] }) {
  const max = Math.max(1, ...topics.map((t) => t.count));
  return (
    <div className="space-y-2.5">
      {topics.map((t) => (
        <div key={t.topic} className="flex items-center gap-3 text-sm">
          <span className="w-32 sm:w-40 shrink-0 truncate text-neutral-300">{t.topic}</span>
          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-500/60"
              style={{ width: `${(t.count / max) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-neutral-500 text-xs">{t.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

// ── Supertag panel ──────────────────────────────────────────────────────────

function SupertagPanel({
  stat,
  report,
  userId,
}: {
  stat: SupertagStat;
  report: SupertagReport | null;
  userId: string | null;
}) {
  const router = useRouter();
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => {
    const focusAreas = report?.focusAreas ?? [];
    const preselected = stat.topics
      .map((t) => t.topic)
      .filter((topic) => focusAreas.some((area) => area.toLowerCase().includes(topic.toLowerCase())));
    return new Set(preselected);
  });
  const [generating, setGenerating] = useState(false);
  const [quizFormat, setQuizFormat] = useState<"multiple-choice" | "short-answer">("multiple-choice");

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }

  async function generateQuiz() {
    if (!userId || generating) return;
    setGenerating(true);
    const topics = selectedTopics.size > 0
      ? Array.from(selectedTopics)
      : stat.topics.map((t) => t.topic);

    const formatInstruction =
      quizFormat === "multiple-choice"
        ? "Ask multiple-choice questions, each with 4 labeled options (A-D), and have me reply with the letter of my answer."
        : "Ask short-answer questions that I respond to in my own words.";

    const text =
      `Quiz me on ${topics.join(", ")} (${stat.supertag}). ` +
      `Ask me one question at a time based on my uploaded notes. ${formatInstruction} ` +
      `Wait for my answer before revealing whether I'm correct and explaining the right answer, then move to the next question. ` +
      `Start with question 1.`;

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject: stat.supertag }),
      });
      const { session } = await res.json();
      sessionStorage.setItem(
        `studymate_pending_${session.id}`,
        JSON.stringify({ text, allowExternal: false })
      );
      router.push(`/chat/${session.id}`);
    } catch {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-4">
          <p className="text-lg font-semibold text-white">{Math.round(stat.confusionRate * 100)}%</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Confusion signals</p>
        </div>
        <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-4">
          <p className="text-lg font-semibold text-white">{Math.round(stat.noAnswerRate * 100)}%</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Not in your notes</p>
        </div>
        <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-4">
          <p className="text-lg font-semibold text-white">
            {new Date(stat.lastStudied).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">Last studied</p>
        </div>
      </div>

      {/* Subtopic breakdown */}
      {stat.topics.length > 0 && (
        <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Subtopics
          </h3>
          <SubtopicBars topics={stat.topics} />
        </div>
      )}

      {/* Quiz generator */}
      {stat.topics.length > 0 && (
        <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Quiz me
            </h3>
            <button
              onClick={generateQuiz}
              disabled={generating}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-orange-900/25 bg-white/[0.03] px-3 py-1 text-[11px] text-neutral-400 hover:text-orange-200/80 hover:border-orange-500/30 transition-colors disabled:opacity-40"
            >
              {generating ? "Starting…" : "Generate quiz"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mb-2.5">
            Pick subtopics to focus on, or leave none selected to quiz the whole subject.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {stat.topics.map((t) => (
                <button
                  key={t.topic}
                  onClick={() => toggleTopic(t.topic)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    selectedTopics.has(t.topic)
                      ? "bg-orange-500/15 border border-orange-500/30 text-orange-200"
                      : "bg-white/5 border border-white/10 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t.topic}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px] shrink-0">
              {(["multiple-choice", "short-answer"] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setQuizFormat(format)}
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    quizFormat === format
                      ? "bg-orange-500/15 text-orange-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {format === "multiple-choice" ? "Multiple choice" : "Short answer"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI deep dive */}
      {report && (
        <div className="space-y-4">
          {report.summary && (
            <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Summary
              </h3>
              <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{report.summary}</p>
            </div>
          )}
          {report.focusAreas?.length > 0 && (
            <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Focus areas
              </h3>
              <ul className="space-y-1.5 list-disc pl-5">
                {report.focusAreas.map((item, i) => (
                  <li key={i} className="text-sm text-neutral-300 leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>
          )}
          {report.resources?.length > 0 && (
            <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Additional resources
              </h3>
              <ul className="space-y-3">
                {report.resources.map((item, i) => (
                  <li key={i}>
                    <p className="text-sm text-neutral-300 leading-relaxed">{item.text}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {searchLinks(item.query).map((link) => (
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
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = typeof window !== "undefined" ? getUserId() : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    Promise.all([
      fetch(`/api/progress?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/progress/report?userId=${userId}`).then((r) => r.json()),
    ])
      .then(([progressData, reportData]) => {
        setProgress(progressData ?? null);
        setReport(reportData.report ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  // Poll every 4 s while a report is generating
  useEffect(() => {
    if (!userId || !report || report.status !== "generating") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    pollRef.current = setInterval(() => {
      fetch(`/api/progress/report?userId=${userId}`)
        .then((r) => r.json())
        .then(({ report: updated }) => {
          if (updated?.status === "ready") setReport(updated);
        })
        .catch(() => {});
    }, 4000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [userId, report?.status]);

  const parsedReport = parseReport(report);
  const hasActivity = (progress?.supertags.length ?? 0) > 0;

  async function regenerate() {
    if (!userId || triggering) return;
    setTriggering(true);
    await fetch("/api/progress/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
    const { report: updated } = await fetch(`/api/progress/report?userId=${userId}`)
      .then((r) => r.json())
      .catch(() => ({ report: null }));
    setReport(updated);
    setTriggering(false);
  }

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
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
          <div>
            <h1 className="text-4xl font-semibold text-white tracking-tight">Progress</h1>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-600">Loading…</p>
          ) : !hasActivity && !report ? (
            <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-6">
              <p className="text-sm text-neutral-400">
                No study activity yet. Upload your notes and ask questions — your analysis will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-white/5 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === "overview"
                      ? "border-orange-500 text-white"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Overview
                </button>
                {progress?.supertags.map((s) => (
                  <button
                    key={s.supertag}
                    onClick={() => setActiveTab(s.supertag)}
                    className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === s.supertag
                        ? "border-orange-500 text-white"
                        : "border-transparent text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {s.supertag}
                  </button>
                ))}
              </div>

              {/* Overview tab */}
              {activeTab === "overview" && (
                <section className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatCard label="Questions asked" value={progress?.totalQuestions ?? 0} />
                    <StatCard label="Subjects studied" value={progress?.supertags.length ?? 0} />
                    <StatCard label="Days active" value={progress?.activeDays ?? 0} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {hasActivity && (
                      <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                          Questions by subject
                        </h3>
                        <DonutChart
                          data={(progress?.supertags ?? []).map((s) => ({ supertag: s.supertag, count: s.count }))}
                        />
                      </div>
                    )}
                    {progress && progress.dailyActivity.some((d) => d.count > 0) && (
                      <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                          Questions per day (last 14 days)
                        </h3>
                        <DailyActivityChart data={progress.dailyActivity} />
                      </div>
                    )}
                  </div>

                  {/* Overall AI summary */}
                  {report?.status === "generating" ? (
                    <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
                      <p className="text-sm font-medium text-orange-100">AI is generating your analysis…</p>
                      <p className="text-xs text-orange-200/50 mt-0.5">This usually takes 10–20 seconds. This page will update automatically.</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-orange-900/25 bg-black/20 backdrop-blur-md p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                          AI overview
                        </h3>
                        <button
                          onClick={regenerate}
                          disabled={triggering}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-orange-900/25 bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-400 hover:text-orange-200/80 hover:border-orange-500/30 transition-colors disabled:opacity-40"
                        >
                          <span>↻</span>
                          {triggering ? "Generating…" : parsedReport?.overall ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                      <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                        {parsedReport?.overall ?? "No analysis yet. Generate one to see how your studying is going."}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Per-subject tabs */}
              {progress?.supertags.map((stat) => (
                activeTab === stat.supertag && (
                  <section key={stat.supertag}>
                    <SupertagPanel
                      stat={stat}
                      report={parsedReport?.supertags.find((s) => s.supertag === stat.supertag) ?? null}
                      userId={userId}
                    />
                  </section>
                )
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

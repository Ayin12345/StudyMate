"use client";

import { useEffect, useState, useRef } from "react";

interface TopicStat {
  topic: string;
  count: number;
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

// ── Donut chart ────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

function DonutChart({ topics }: { topics: TopicStat[] }) {
  const total = topics.reduce((s, t) => s + t.count, 0);
  if (total === 0 || topics.length === 0) return null;

  const CX = 80, CY = 80, R = 60, r = 36;

  // Single-topic: can't draw an arc with identical start/end points, use circles instead
  if (topics.length === 1) {
    return (
      <div className="flex items-center gap-8">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={CX} cy={CY} r={R} fill={CHART_COLORS[0]} />
          <circle cx={CX} cy={CY} r={r} fill="white" />
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize="20" fontWeight="600" fill="#111827">
            {total}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="#9ca3af">
            questions
          </text>
        </svg>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[0] }} />
            <span className="text-gray-700">{topics[0].topic}</span>
            <span className="text-gray-400 ml-auto pl-8">100%</span>
          </li>
        </ul>
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const slices = topics.map((t, i) => {
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
      label: t.topic,
    };
  });

  return (
    <div className="flex items-center gap-8">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="20" fontWeight="600" fill="#111827">
          {total}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="#9ca3af">
          questions
        </text>
      </svg>
      <ul className="space-y-2.5">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700 truncate">{s.label}</span>
            <span className="text-gray-400 ml-auto pl-6 shrink-0">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Report section ─────────────────────────────────────────────────────────

function ReportSection({ report }: { report: Report | null }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
        No analysis yet. Your first report will be generated after a few study sessions.
      </div>
    );
  }

  if (report.status === "generating") {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 flex items-start gap-3">
        <span className="mt-0.5 relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
        </span>
        <div>
          <p className="text-sm font-medium text-blue-900">AI is generating your report…</p>
          <p className="text-xs text-blue-600 mt-0.5">This usually takes 10–20 seconds. This page will update automatically.</p>
        </div>
      </div>
    );
  }

  if (!report.report_text) return null;

  // Parse the four sections from the report text
  const sections = parseReportSections(report.report_text);

  return (
    <div className="space-y-4">
      {sections.length > 0 ? (
        sections.map(({ header, body }, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {header}
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.report_text}</p>
        </div>
      )}
      {report.completed_at && (
        <p className="text-xs text-gray-400 text-right">
          Generated {new Date(report.completed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function parseReportSections(text: string): { header: string; body: string }[] {
  const HEADERS = ["SUMMARY", "STRONG AREAS", "NEEDS MORE ATTENTION", "RECOMMENDATIONS"];
  const result: { header: string; body: string }[] = [];
  let remaining = text;

  for (let i = 0; i < HEADERS.length; i++) {
    const header = HEADERS[i];
    const nextHeader = HEADERS[i + 1];
    const start = remaining.indexOf(header);
    if (start === -1) continue;
    const afterHeader = remaining.slice(start + header.length).trimStart();
    const nextStart = nextHeader ? afterHeader.indexOf(nextHeader) : -1;
    const body = nextStart === -1 ? afterHeader.trim() : afterHeader.slice(0, nextStart).trim();
    result.push({ header, body });
    remaining = nextStart === -1 ? "" : afterHeader.slice(nextStart);
  }

  return result;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = typeof window !== "undefined" ? getUserId() : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    Promise.all([
      fetch(`/api/progress?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/progress/report?userId=${userId}`).then((r) => r.json()),
    ])
      .then(([progressData, reportData]) => {
        setTopics(progressData.topTopics ?? []);
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

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  }

  const hasActivity = topics.length > 0;

  if (!hasActivity && !report) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Progress</h1>
        <p className="text-sm text-gray-500">
          No study activity yet. Upload your notes and ask questions — your analysis will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-10">
      <h1 className="text-xl font-semibold text-gray-900">Progress</h1>

      {/* AI Report */}
      <section>
        <h2 className="text-sm font-medium text-gray-700 mb-3">AI Analysis</h2>
        <ReportSection report={report} />
      </section>

      {/* Topic distribution */}
      {hasActivity && (
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-4">Topics studied</h2>
          <DonutChart topics={topics} />
          <table className="w-full text-sm mt-6">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-normal">Topic</th>
                <th className="text-right py-2 text-gray-500 font-normal">Questions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map(({ topic, count }) => (
                <tr key={topic} className="border-b border-gray-50">
                  <td className="py-2 text-gray-900">{topic}</td>
                  <td className="py-2 text-right text-gray-600">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Manual report trigger */}
      {report?.status !== "generating" && (
        <div className="flex justify-center pb-2">
          <button
            onClick={async () => {
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
            }}
            disabled={triggering}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors disabled:opacity-40"
          >
            {triggering ? "Requesting…" : "Regenerate analysis"}
          </button>
        </div>
      )}
    </div>
  );
}

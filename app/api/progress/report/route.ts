import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isStudiableTopic } from "@/lib/tag-filter";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data: report } = await supabase
    .from("progress_reports")
    .select("id, status, report_text, events_included_count, created_at, completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ report: report ?? null });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Prevent duplicate concurrent generation (ignore if stale > 5 min)
    const { data: existing } = await supabase
      .from("progress_reports")
      .select("status, created_at")
      .eq("user_id", userId)
      .eq("status", "generating")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const isStale = new Date(existing.created_at) < new Date(Date.now() - 5 * 60 * 1000);
      if (!isStale) return NextResponse.json({ alreadyGenerating: true });
    }

    // Snapshot current event count so we know where this report ends
    const { count: totalEvents } = await supabase
      .from("study_events")
      .select("*", { count: "exact", head: true })
      .eq("session_id", userId);

    // Insert placeholder row so the progress page can show "generating"
    const { data: reportRow, error: insertErr } = await supabase
      .from("progress_reports")
      .insert({ user_id: userId, status: "generating", events_included_count: totalEvents ?? 0 })
      .select()
      .single();

    if (insertErr || !reportRow) throw insertErr ?? new Error("Failed to create report row");

    // Fetch all enriched study events
    const { data: events } = await supabase
      .from("study_events")
      .select("topic, question, confusion_score, answer_found, question_type, created_at")
      .eq("session_id", userId)
      .order("created_at", { ascending: true });

    const allEvents = (events ?? []).filter((e) => isStudiableTopic(e.topic));

    if (allEvents.length < 3) {
      await supabase
        .from("progress_reports")
        .update({
          status: "ready",
          report_text:
            "Keep studying! Ask a few more questions about your uploaded notes and I'll put together a detailed analysis.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportRow.id);
      return NextResponse.json({ success: true });
    }

    // Aggregate per-topic data
    const topicMap = new Map<string, {
      questions: string[];
      confusionCount: number;
      noContextCount: number;
      types: Record<string, number>;
    }>();

    for (const e of allEvents) {
      if (!topicMap.has(e.topic)) {
        topicMap.set(e.topic, { questions: [], confusionCount: 0, noContextCount: 0, types: {} });
      }
      const t = topicMap.get(e.topic)!;
      t.questions.push(e.question);
      if ((e.confusion_score ?? 0) >= 2) t.confusionCount++;
      if (e.answer_found === false) t.noContextCount++;
      const qt = e.question_type ?? "general";
      t.types[qt] = (t.types[qt] ?? 0) + 1;
    }

    const topicSections = [...topicMap.entries()]
      .map(([topic, data]) => {
        const sampleQs = data.questions.slice(-5).map((q) => `  - "${q}"`).join("\n");
        const typeBreakdown = Object.entries(data.types).map(([t, c]) => `${t}: ${c}`).join(", ");
        return [
          `Topic: "${topic}"`,
          `  Total questions asked: ${data.questions.length}`,
          `  Confusion signals detected: ${data.confusionCount}`,
          `  Questions where uploaded notes had no answer: ${data.noContextCount}`,
          `  Question types: ${typeBreakdown || "general"}`,
          `  Recent questions:\n${sampleQs}`,
        ].join("\n");
      })
      .join("\n\n");

    const prompt = `You are an educational performance analyst helping a student improve their study habits.

Analyze the following study data and generate a helpful, specific progress report.

Study Data:
Total questions analyzed: ${allEvents.length}
Topics covered: ${[...topicMap.keys()].join(", ")}

${topicSections}

Write a report with EXACTLY these four section headers on their own line, followed by the content:

SUMMARY
2-3 sentences summarizing overall study patterns. Name specific topics.

STRONG AREAS
Topics showing good understanding (low confusion, varied question types like why/how/compare). If no clear strengths yet, say so briefly.

NEEDS MORE ATTENTION
Topics with high confusion signals or many basic recall questions. Describe the specific pattern. Reference actual questions if helpful.

RECOMMENDATIONS
3-5 numbered specific recommendations. Reference actual topics and observed patterns. Mention what to re-read, what kinds of practice to do, and whether notes seem to be missing content.

Tone: friendly, encouraging, and specific. Use plain text only — no markdown bold (**), no ## headers, no dash bullet points. Use the section headers exactly as shown above.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const reportText =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "Report generation failed.";

    await supabase
      .from("progress_reports")
      .update({ status: "ready", report_text: reportText, completed_at: new Date().toISOString() })
      .eq("id", reportRow.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/progress/report]", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

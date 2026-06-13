import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { isStudiableTopic, buildSupertagResolver } from "@/lib/tag-filter";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ReportSchema = z.object({
  overall: z.string(),
  supertags: z.array(z.object({
    supertag: z.string(),
    summary: z.string(),
    focusAreas: z.array(z.string()),
    resources: z.array(z.object({
      text: z.string(),
      query: z.string(),
    })),
  })),
});

function extractJsonString(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  return raw.trim();
}

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

    // Fetch all enriched study events, plus documents to resolve broad subjects
    const [{ data: events }, { data: docs }] = await Promise.all([
      supabase
        .from("study_events")
        .select("supertag, subject, topic, question, confusion_score, answer_found, question_type, created_at")
        .eq("session_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("tags, supertag")
        .eq("session_id", userId),
    ]);

    const allEvents = (events ?? []).filter((e) => isStudiableTopic(e.topic));
    const resolveSupertag = buildSupertagResolver(docs ?? []);

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

    // Aggregate per-supertag, then per-topic within each supertag
    const supertagMap = new Map<string, Map<string, {
      questions: string[];
      confusionCount: number;
      noContextCount: number;
      types: Record<string, number>;
    }>>();

    for (const e of allEvents) {
      const supertag = resolveSupertag(e);
      if (!supertagMap.has(supertag)) supertagMap.set(supertag, new Map());
      const topicMap = supertagMap.get(supertag)!;
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

    const supertagSections = [...supertagMap.entries()]
      .map(([supertag, topicMap]) => {
        const topicText = [...topicMap.entries()]
          .map(([topic, data]) => {
            const sampleQs = data.questions.slice(-5).map((q) => `    - "${q}"`).join("\n");
            const typeBreakdown = Object.entries(data.types).map(([t, c]) => `${t}: ${c}`).join(", ");
            return [
              `  Subtopic: "${topic}"`,
              `    Total questions asked: ${data.questions.length}`,
              `    Confusion signals detected: ${data.confusionCount}`,
              `    Questions where uploaded notes had no answer: ${data.noContextCount}`,
              `    Question types: ${typeBreakdown || "general"}`,
              `    Recent questions:\n${sampleQs}`,
            ].join("\n");
          })
          .join("\n");
        return `Subject: "${supertag}"\n${topicText}`;
      })
      .join("\n\n");

    const supertagNames = [...supertagMap.keys()];

    const prompt = `You are an educational performance analyst helping a student improve their study habits.

Analyze the following study data and generate a helpful, specific progress report.

Study Data:
Total questions analyzed: ${allEvents.length}
Subjects covered: ${supertagNames.join(", ")}

${supertagSections}

Reply with a JSON object only, no markdown, no code fences, matching this exact shape:

{
  "overall": "2-3 sentences summarizing overall study patterns across all subjects. Name specific subjects.",
  "supertags": [
    {
      "supertag": "<exact subject name from the data above>",
      "summary": "1 sentence: how active this subject is and the overall pattern (e.g. mostly recall questions, high confusion, well-rounded).",
      "focusAreas": "An array of 1-4 short, specific topics to revisit, ordered by priority. Each entry is a single sentence naming the subtopic and the concrete reason (high confusion, recall-only questions, notes missing content, off-topic questions, etc). Skip subtopics that are going fine. If everything looks solid, return an empty array.",
      "resources": "An array of 1-3 objects, each tied to a focus area: { \"text\": short description of what to look up and why (e.g. 'A walkthrough of how stacks and queues differ'), \"query\": a short search-engine query string for that topic (2-6 words, e.g. 'stack vs queue data structure') }. Do not invent specific URLs, book titles, or authors — only the search query. If there is nothing useful to suggest, return an empty array."
    }
  ]
}

Include one entry in "supertags" for EVERY subject listed above, using the exact subject name. Be terse and concrete — no filler, no restating the data, no encouragement-only sentences. Every item must point at something actionable. Plain text only inside string values — no markdown bold, no headers, no bullet characters.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";

    let reportText: string;
    try {
      const parsed = ReportSchema.parse(JSON.parse(extractJsonString(raw)));
      reportText = JSON.stringify(parsed);
    } catch {
      reportText = JSON.stringify({
        overall: "Report generation failed. Try regenerating.",
        supertags: [],
      });
    }

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

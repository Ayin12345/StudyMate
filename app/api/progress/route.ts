import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isStudiableTopic, buildSupertagResolver } from "@/lib/tag-filter";

const DAILY_ACTIVITY_DAYS = 14;

export async function GET(req: NextRequest) {
  try {
    const userId = new URL(req.url).searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const [{ data: events, error }, { data: docs }] = await Promise.all([
      supabase
        .from("study_events")
        .select("supertag, subject, topic, confusion_score, answer_found, created_at")
        .eq("session_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("tags, supertag")
        .eq("session_id", userId),
    ]);

    if (error) throw error;

    // Include every event in the overview totals, even ones tied to untagged
    // "All documents" uploads — only the subtopic breakdown filters generic topics.
    const allEvents = events ?? [];

    const resolveSupertag = buildSupertagResolver(docs ?? []);

    // Group by broad subject (supertag), with subtopics nested inside
    const supertagMap = new Map<string, {
      count: number;
      topics: Map<string, number>;
      confusionCount: number;
      noContextCount: number;
      lastStudied: string;
    }>();

    for (const e of allEvents) {
      const key = resolveSupertag(e);
      if (!supertagMap.has(key)) {
        supertagMap.set(key, {
          count: 0,
          topics: new Map(),
          confusionCount: 0,
          noContextCount: 0,
          lastStudied: e.created_at,
        });
      }
      const s = supertagMap.get(key)!;
      s.count++;
      if (isStudiableTopic(e.topic)) {
        s.topics.set(e.topic, (s.topics.get(e.topic) ?? 0) + 1);
      }
      if ((e.confusion_score ?? 0) >= 2) s.confusionCount++;
      if (e.answer_found === false) s.noContextCount++;
      if (e.created_at > s.lastStudied) s.lastStudied = e.created_at;
    }

    const supertags = [...supertagMap.entries()]
      .map(([supertag, data]) => ({
        supertag,
        count: data.count,
        confusionRate: data.count > 0 ? data.confusionCount / data.count : 0,
        noAnswerRate: data.count > 0 ? data.noContextCount / data.count : 0,
        lastStudied: data.lastStudied,
        topics: [...data.topics.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([topic, count]) => ({ topic, count })),
      }))
      .sort((a, b) => b.count - a.count);

    // Daily activity for the last DAILY_ACTIVITY_DAYS days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayBuckets = new Map<string, number>();
    for (let i = DAILY_ACTIVITY_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dayBuckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of allEvents) {
      const day = e.created_at.slice(0, 10);
      if (dayBuckets.has(day)) {
        dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
      }
    }
    const dailyActivity = [...dayBuckets.entries()].map(([date, count]) => ({ date, count }));

    const activeDays = new Set(allEvents.map((e) => e.created_at.slice(0, 10))).size;

    return NextResponse.json({
      totalQuestions: allEvents.length,
      activeDays,
      supertags,
      dailyActivity,
    });
  } catch (err) {
    console.error("[/api/progress]", err);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

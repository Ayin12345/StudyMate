import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isStudiableTopic } from "@/lib/tag-filter";

export async function GET(req: NextRequest) {
  try {
    const userId = new URL(req.url).searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data: events, error } = await supabase
      .from("study_events")
      .select("topic, subject, created_at")
      .eq("session_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Drop generic non-studiable topics (e.g. "Notes", "General")
    const allEvents = (events ?? []).filter((e) => isStudiableTopic(e.topic));

    // topTopics: count total questions per topic, sorted by frequency
    const topicCounts = new Map<string, number>();
    for (const e of allEvents) {
      topicCounts.set(e.topic, (topicCounts.get(e.topic) ?? 0) + 1);
    }
    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count }));

    return NextResponse.json({ topTopics });
  } catch (err) {
    console.error("[/api/progress]", err);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

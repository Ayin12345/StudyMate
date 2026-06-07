import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { session_id, subject, topic, question, retrieved_chunk_ids } =
      await req.json();

    if (!session_id || !subject || !topic || !question) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("study_events")
      .insert({ session_id, subject, topic, question, retrieved_chunk_ids: retrieved_chunk_ids ?? [] })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ event: data });
  } catch (err) {
    console.error("[/api/study-events]", err);
    return NextResponse.json({ error: "Failed to log study event" }, { status: 500 });
  }
}

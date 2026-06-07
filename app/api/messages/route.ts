import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[/api/messages]", error);
    return NextResponse.json({ error: "Failed to load messages." }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

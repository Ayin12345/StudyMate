import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { sessionId, content } = await req.json() as { sessionId: string; content: string };

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    // Load full conversation history for this session from Supabase
    const { data: rows, error: loadError } = await supabase
      .from("conversations")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (loadError) throw loadError;

    const history = (rows ?? []) as { role: "user" | "assistant"; content: string }[];
    const messages = [...history, { role: "user" as const, content }];

    // Call Claude with full history
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "You are StudyMate, a helpful study assistant. Answer clearly and concisely.",
      // add more detailed system prompt for StudyMate later
      messages,
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Persist user message and assistant reply to Supabase
    const { error: insertError } = await supabase.from("conversations").insert([
      { session_id: sessionId, role: "user", content },
      { session_id: sessionId, role: "assistant", content: reply },
    ]);

    if (insertError) throw insertError;

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: "Failed to get a response from Claude." }, { status: 500 });
  }
}

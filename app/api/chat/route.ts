import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embed";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ChunkMatch = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
};

export async function POST(req: NextRequest) {
  try {
    const { sessionId, content } = await req.json() as { sessionId: string; content: string };

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    // Load full conversation history
    const { data: rows, error: loadError } = await supabase
      .from("conversations")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (loadError) throw loadError;

    // Embed the question and retrieve the most relevant chunks
    const queryEmbedding = await getEmbedding(content);

    const { data: chunks, error: rpcError } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: 5,
      p_session_id: sessionId,
    });

    if (rpcError) throw rpcError;

    const matches = (chunks ?? []) as ChunkMatch[];

    // Log retrieved chunks for debugging (Phase 4 step 3)
    console.log(
      "[/api/chat] top chunks retrieved:",
      matches.map((c) => ({ similarity: c.similarity.toFixed(3), preview: c.content.slice(0, 80) }))
    );

    // Build system prompt — answer only from context if documents exist
    let systemPrompt: string;
    if (matches.length > 0) {
      const contextBlocks = matches
        .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
        .join("\n\n");
      systemPrompt =
        `You are StudyMate, a study assistant. Answer the user's question using ONLY the context below.\n` +
        `If the answer is not found in the context, respond with exactly: "I don't know based on your notes."\n\n` +
        `Context:\n${contextBlocks}`;
    } else {
      systemPrompt =
        `You are StudyMate, a study assistant. The user has not uploaded any documents yet. ` +
        `Let them know they can upload study notes on the Documents page before asking questions.`;
    }

    const history = (rows ?? []) as { role: "user" | "assistant"; content: string }[];
    const messages = [...history, { role: "user" as const, content }];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    // Persist both turns to Supabase
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

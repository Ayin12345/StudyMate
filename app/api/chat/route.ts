import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embed";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CitedAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.number().int().positive()),
});

type ChunkMatch = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  document_title: string;
  position: number;
};

function extractJsonString(raw: string): string {
  // Try markdown code block first
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  // Try to find a JSON object anywhere in the response (handles extra preamble text)
  const jsonObject = raw.match(/\{[\s\S]*"answer"[\s\S]*"citations"[\s\S]*\}/);
  if (jsonObject) return jsonObject[0];
  return raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, userId, content } = await req.json() as { sessionId: string; userId: string; content: string };

    if (!sessionId || !userId || !content?.trim()) {
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
      p_session_id: userId,
    });

    if (rpcError) throw rpcError;

    // Sort by document order so [1] = first chunk in the document, not most similar
    const matches = ((chunks ?? []) as ChunkMatch[]).sort((a, b) =>
      a.document_id.localeCompare(b.document_id) || a.position - b.position
    );

    console.log(
      "[/api/chat] top chunks retrieved:",
      matches.map((c) => ({ similarity: c.similarity.toFixed(3), preview: c.content.slice(0, 80) }))
    );

    // Build system prompt
    let systemPrompt: string;
    if (matches.length > 0) {
      const contextBlocks = matches
        .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
        .join("\n\n");
      systemPrompt =
        `You are StudyMate, a study assistant.\n` +
        `Answer the user's question using ONLY the context blocks below.\n` +
        `Your ENTIRE response must be a single raw JSON object — no text before it, no text after it, no markdown, no code fences:\n` +
        `{"answer": "<your answer as plain text with inline [N] markers>", "citations": [<unique N values you cited>]}\n` +
        `Rules:\n` +
        `- Write the answer as plain text with no markdown formatting (no ** or ## or - bullets).\n` +
        `- Place [N] inline only the FIRST time you draw on context block N.\n` +
        `- "citations" must list each cited number exactly once.\n` +
        `- If the answer is not in the context, return: {"answer": "I don't know based on your notes.", "citations": []}\n\n` +
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
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse, validate, and filter citations
    let reply: string;
    let citations: number[] = [];
    let citedChunks: { index: number; content: string; document_title: string }[] = [];

    if (matches.length > 0) {
      try {
        const parsed = CitedAnswerSchema.parse(JSON.parse(extractJsonString(raw)));
        const validIndices = new Set(matches.map((_, i) => i + 1));
        citations = parsed.citations.filter((n) => validIndices.has(n));
        reply = parsed.answer;
        citedChunks = citations.map((n) => ({
          index: n,
          content: matches[n - 1].content,
          document_title: matches[n - 1].document_title,
        }));
      } catch {
        // Fallback: treat raw output as plain text with no citations
        reply = raw;
      }
    } else {
      reply = raw;
    }

    // Persist the answer text (not raw JSON) to conversation history
    const { error: insertError } = await supabase.from("conversations").insert([
      { session_id: sessionId, role: "user", content },
      { session_id: sessionId, role: "assistant", content: reply },
    ]);

    if (insertError) throw insertError;

    // Generate a session title from the first user message
    if (history.length === 0) {
      client.messages
        .create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 20,
          messages: [
            {
              role: "user",
              content: `Give this chat a short title of 3–6 words based on the question below. Reply with just the title, no punctuation at the end.\n\nQuestion: ${content}`,
            },
          ],
        })
        .then((r) => {
          const title = r.content[0].type === "text" ? r.content[0].text.trim() : content.slice(0, 50);
          return supabase.from("sessions").update({ title }).eq("id", sessionId);
        })
        .catch(() => {});
    }

    return NextResponse.json({ reply, citations, chunks: citedChunks, isFirstMessage: history.length === 0 });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: "Failed to get a response from Claude." }, { status: 500 });
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embed";
import { pickTopic, classifyQuestion } from "@/lib/tag-filter";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// New report generated every time this many new study events have accumulated
const REPORT_THRESHOLD = 5;

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
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonObject = raw.match(/\{[\s\S]*"answer"[\s\S]*"citations"[\s\S]*\}/);
  if (jsonObject) return jsonObject[0];
  return raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, userId, content } = await req.json() as {
      sessionId: string;
      userId: string;
      content: string;
    };

    if (!sessionId || !userId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    // Load conversation history + report threshold data in parallel
    const [
      { data: rows, error: loadError },
      { count: eventCount },
      { data: lastReport },
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("study_events")
        .select("*", { count: "exact", head: true })
        .eq("session_id", userId),
      supabase
        .from("progress_reports")
        .select("events_included_count, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (loadError) throw loadError;

    // Compute whether a new report should be triggered after this event
    const newEventsSinceLastReport =
      (eventCount ?? 0) - (lastReport?.events_included_count ?? 0);
    const isStaleGenerating =
      lastReport?.status === "generating" &&
      new Date(lastReport.created_at) < new Date(Date.now() - 5 * 60 * 1000);
    const isGenerating = lastReport?.status === "generating" && !isStaleGenerating;
    // +1 because this current message will become a new event
    const shouldGenerateReport =
      !isGenerating && newEventsSinceLastReport + 1 >= REPORT_THRESHOLD;

    // Embed the question and retrieve the most relevant chunks
    const queryEmbedding = await getEmbedding(content);

    const { data: chunks, error: rpcError } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: 5,
      p_session_id: userId,
    });

    if (rpcError) throw rpcError;

    // Capture the top-similarity chunk's document BEFORE re-sorting (RPC returns similarity-desc)
    const rawChunks = (chunks ?? []) as ChunkMatch[];
    const topSimilarityDocId = rawChunks[0]?.document_id ?? null;

    // Re-sort by document order so [1] = first chunk in the document, not most similar
    const matches = [...rawChunks].sort(
      (a, b) => a.document_id.localeCompare(b.document_id) || a.position - b.position
    );

    console.log(
      "[/api/chat] top chunks retrieved:",
      matches.map((c) => ({
        similarity: c.similarity.toFixed(3),
        preview: c.content.slice(0, 80),
      }))
    );

    // Build system prompt
    let systemPrompt: string;
    if (matches.length > 0) {
      const contextBlocks = matches.map((chunk, i) => `[${i + 1}] ${chunk.content}`).join("\n\n");
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

    // Start title generation in parallel with Sonnet (Haiku is faster, so it'll be ready first)
    const titlePromise: Promise<string | null> =
      history.length === 0
        ? client.messages
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
            .then((r) =>
              r.content[0].type === "text" ? r.content[0].text.trim() : content.slice(0, 50)
            )
            .catch(() => content.slice(0, 50))
        : Promise.resolve(null);

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
        reply = raw;
      }
    } else {
      reply = raw;
    }

    // Persist the answer text (not raw JSON) to conversation history, including chunks for citation restoration
    const { error: insertError } = await supabase.from("conversations").insert([
      { session_id: sessionId, role: "user", content },
      { session_id: sessionId, role: "assistant", content: reply, chunks: citedChunks.length > 0 ? citedChunks : null },
    ]);

    if (insertError) throw insertError;

    // Log enriched study event (fire-and-forget — non-fatal if it fails)
    if (matches.length > 0 && topSimilarityDocId) {
      (async () => {
        const { data: doc } = await supabase
          .from("documents")
          .select("tags")
          .eq("id", topSimilarityDocId)
          .single();

        const tags: string[] = doc?.tags ?? [];
        const { subject, topic } = pickTopic(tags);
        const { confusionScore, questionType } = classifyQuestion(content);
        const answerFound = !reply.toLowerCase().startsWith("i don't know");

        await supabase.from("study_events").insert({
          session_id: userId,
          subject,
          topic,
          question: content,
          retrieved_chunk_ids: matches.map((c) => c.id),
          confusion_score: confusionScore,
          question_type: questionType,
          answer_found: answerFound,
        });
      })().catch(() => {});
    }

    // Await the title (already done by now — Haiku beat Sonnet) and save it
    const generatedTitle = await titlePromise;
    if (generatedTitle) {
      await supabase.from("sessions").update({ title: generatedTitle }).eq("id", sessionId);
    }

    return NextResponse.json({
      reply,
      citations,
      chunks: citedChunks,
      title: generatedTitle,
      shouldGenerateReport,
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: "Failed to get a response from Claude." }, { status: 500 });
  }
}

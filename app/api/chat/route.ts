import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embed";
import { pickTopic, classifyQuestion } from "@/lib/tag-filter";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// New report generated every time this many new study events have accumulated
const REPORT_THRESHOLD = 10;

// Marker Claude writes (literally, as text) at the end of its answer, followed by
// a single-line JSON object with citations/resources for that answer.
const CLAUDE_META_MARKER = "\n<<<STUDYMATE_META>>>";

// Marker the server appends to the streamed response (never seen by Claude),
// followed by a single-line JSON object with everything the client needs once
// the answer has finished streaming.
const STREAM_META_MARKER = "\n␞STUDYMATE_META␞";

const ClaudeMetaSchema = z.object({
  citations: z.array(z.number().int().positive()).optional(),
  resources: z.array(z.object({ text: z.string(), query: z.string() })).optional(),
});

type ChunkMatch = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  document_title: string;
  position: number;
};

const NOT_FOUND_MESSAGE =
  "I'm designed to only answer using your uploaded notes, so my answers stay accurate and grounded in your material — and I couldn't find this in your notes. Turn on the globe icon below the message box if you'd like me to answer using my general knowledge instead.";

// Chunks below this cosine similarity are treated as unrelated to the question,
// even if pgvector returns them as the "closest" available chunks.
const MIN_SIMILARITY = 0.35;

// Claude often writes LaTeX (e.g. "\cdot", "\_", "\times") inside its answer.
// Those backslash sequences aren't valid JSON escapes, so JSON.parse throws
// on them — escape the backslash itself so they survive parsing as literal text.
function sanitizeJsonEscapes(json: string): string {
  return json.replace(/\\(.)/g, (match, ch) => ("\"\\/bfnrtu".includes(ch) ? match : `\\\\${ch}`));
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, userId, content, allowExternal } = await req.json() as {
      sessionId: string;
      userId: string;
      content: string;
      allowExternal?: boolean;
    };

    if (!sessionId || !userId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    // Load conversation history + report threshold data in parallel
    const [
      { data: rows, error: loadError },
      { count: eventCount },
      { data: lastReport },
      { data: session },
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
      supabase
        .from("sessions")
        .select("subject")
        .eq("id", sessionId)
        .single(),
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
      p_subject: session?.subject ?? null,
    });

    if (rpcError) throw rpcError;

    const rawChunks = (chunks ?? []) as ChunkMatch[];

    // Discard chunks that aren't actually relevant to this question — pgvector
    // always returns its closest matches, even when nothing in the notes is related.
    const relevantChunks = rawChunks.filter((c) => c.similarity >= MIN_SIMILARITY);

    // Capture the top-similarity relevant chunk's document BEFORE re-sorting (RPC returns similarity-desc)
    const topSimilarityDocId = relevantChunks[0]?.document_id ?? null;

    // Re-sort by document order so [1] = first chunk in the document, not most similar
    const matches = [...relevantChunks].sort(
      (a, b) => a.document_id.localeCompare(b.document_id) || a.position - b.position
    );

    console.log(
      "[/api/chat] chunks retrieved:",
      rawChunks.map((c) => ({
        similarity: c.similarity.toFixed(3),
        relevant: c.similarity >= MIN_SIMILARITY,
        preview: c.content.slice(0, 80),
      }))
    );

    // Build system prompt. `callClaude` is false only when chunks were retrieved,
    // none are relevant, and outside-resource mode is off — in that case we
    // already know the answer (NOT_FOUND_MESSAGE) and skip the model call.
    let systemPrompt = "";
    let callClaude = true;
    if (matches.length > 0) {
      const contextBlocks = matches.map((chunk, i) => `[${i + 1}] ${chunk.content}`).join("\n\n");
      systemPrompt =
        `You are StudyMate, a study assistant.\n` +
        (allowExternal
          ? `Answer the user's question primarily using the context blocks below. ` +
            `You may also draw on your own general knowledge to add helpful detail — blend it in naturally without commenting on what is or isn't in the notes.\n`
          : `Answer the user's question using ONLY the context blocks below. If the answer is not in the context, respond with exactly this message and nothing else: ${JSON.stringify(NOT_FOUND_MESSAGE)}\n`) +
        `Write your answer directly in Markdown — use bullet points, numbered lists, tables, bold, and code blocks where they make the answer clearer. Place [N] inline only the FIRST time you draw on context block N.\n` +
        `After the answer, on its own new line, write exactly "<<<STUDYMATE_META>>>" followed immediately by a single-line JSON object: {"citations": [<unique N values you cited>]${allowExternal ? `, "resources": [<see below>]` : ``}}\n` +
        `"citations" must list each cited number exactly once, and ONLY for claims drawn from the context blocks.\n` +
        (allowExternal
          ? `If you added information beyond the context blocks from your own general knowledge, include 1-3 "resources" objects {"text": "<short description of what to look up>", "query": "<2-6 word search query>"} for further reading on that extra info. Do not invent URLs, book titles, or authors — only the search query. If you didn't add anything beyond the context, use "resources": [].\n`
          : ``) +
        `\nContext:\n${contextBlocks}`;
    } else if (allowExternal) {
      systemPrompt =
        `You are StudyMate, a study assistant. No matching notes were found for this question, ` +
        `but outside-resource mode is enabled, so answer using your own general knowledge.\n` +
        `Answer directly and naturally in Markdown — use bullet points, numbered lists, tables, bold, and code blocks where they make the answer clearer. Do not mention notes, "beyond your notes", or apologize for anything not being covered.\n` +
        `After the answer, on its own new line, write exactly "<<<STUDYMATE_META>>>" followed immediately by a single-line JSON object: {"citations": [], "resources": [<see below>]}\n` +
        `Include 1-3 "resources" objects {"text": "<short description of what to look up>", "query": "<2-6 word search query>"} for further reading on this topic. Do not invent URLs, book titles, or authors — only the search query. If nothing useful comes to mind, use "resources": [].`;
    } else if (rawChunks.length === 0 && session?.subject) {
      systemPrompt =
        `You are StudyMate, a study assistant. This chat is scoped to the "${session.subject}" subject, ` +
        `but no matching notes were found. Let the user know they can upload notes tagged "${session.subject}" ` +
        `on the Documents page, or start a new chat scoped to "All documents".`;
    } else if (rawChunks.length === 0) {
      systemPrompt =
        `You are StudyMate, a study assistant. The user has not uploaded any documents yet. ` +
        `Let them know they can upload study notes on the Documents page before asking questions.`;
    } else {
      // Chunks were retrieved, but none are relevant to this question, and outside-resource mode is off.
      callClaude = false;
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (text: string) => controller.enqueue(encoder.encode(text));

        try {
          let answerText = "";
          let claudeMetaRaw = "";

          if (callClaude) {
            const claudeStream = client.messages.stream({
              model: "claude-sonnet-4-6",
              max_tokens: 2048,
              system: systemPrompt,
              messages,
            });

            let pending = "";
            let foundMeta = false;
            const markerLen = CLAUDE_META_MARKER.length;

            claudeStream.on("text", (delta) => {
              if (foundMeta) {
                claudeMetaRaw += delta;
                return;
              }
              pending += delta;
              const idx = pending.indexOf(CLAUDE_META_MARKER);
              if (idx !== -1) {
                const before = pending.slice(0, idx);
                answerText += before;
                send(before);
                claudeMetaRaw = pending.slice(idx + markerLen);
                foundMeta = true;
                pending = "";
                return;
              }
              // Keep a safety tail in case the marker spans multiple chunks
              const safeLen = Math.max(0, pending.length - (markerLen - 1));
              if (safeLen > 0) {
                const chunk = pending.slice(0, safeLen);
                answerText += chunk;
                send(chunk);
                pending = pending.slice(safeLen);
              }
            });

            await claudeStream.finalMessage();
            if (!foundMeta && pending) {
              answerText += pending;
              send(pending);
            }
          } else {
            answerText = NOT_FOUND_MESSAGE;
            send(NOT_FOUND_MESSAGE);
          }

          const reply = answerText.trim();

          // Parse Claude's trailing meta JSON (citations/resources), if present
          let citations: number[] = [];
          let resources: { text: string; query: string }[] = [];
          if (claudeMetaRaw.trim()) {
            try {
              const parsed = ClaudeMetaSchema.parse(JSON.parse(sanitizeJsonEscapes(claudeMetaRaw.trim())));
              const validIndices = new Set(matches.map((_, i) => i + 1));
              citations = (parsed.citations ?? []).filter((n) => validIndices.has(n));
              resources = parsed.resources ?? [];
            } catch {
              // Ignore malformed meta — answer text is still valid
            }
          }

          const citedChunks = citations.map((n) => ({
            index: n,
            content: matches[n - 1].content,
            document_title: matches[n - 1].document_title,
          }));

          // Persist the answer text to conversation history, including chunks for citation restoration
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
                .select("tags, supertag")
                .eq("id", topSimilarityDocId)
                .single();

              const tags: string[] = doc?.tags ?? [];
              const { subject, topic } = pickTopic(tags);
              const { confusionScore, questionType } = classifyQuestion(content);
              const answerFound = reply !== NOT_FOUND_MESSAGE;

              await supabase.from("study_events").insert({
                session_id: userId,
                subject,
                topic,
                supertag: doc?.supertag ?? null,
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

          send(STREAM_META_MARKER + JSON.stringify({
            citations,
            chunks: citedChunks,
            resources,
            notFoundInNotes: !allowExternal && reply === NOT_FOUND_MESSAGE,
            title: generatedTitle,
            shouldGenerateReport,
          }));
        } catch (err) {
          console.error("[/api/chat] stream", err);
          send(STREAM_META_MARKER + JSON.stringify({ error: true }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: "Failed to get a response from Claude." }, { status: 500 });
  }
}

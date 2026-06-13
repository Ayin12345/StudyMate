import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJsonString(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  return raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { userId, text } = await req.json() as { userId?: string; text?: string };
    if (!userId || !text?.trim()) {
      return NextResponse.json({ error: "userId and text are required" }, { status: 400 });
    }

    // Fetch all existing tags and supertags the user has already used
    const { data: docs } = await supabase
      .from("documents")
      .select("tags, supertag")
      .eq("session_id", userId);

    const existingTags = Array.from(
      new Set((docs ?? []).flatMap((d: { tags: string[] }) => d.tags))
    ).filter(Boolean);

    const existingSupertags = Array.from(
      new Set((docs ?? []).map((d: { supertag: string | null }) => d.supertag))
    ).filter((t): t is string => Boolean(t));

    const existingTagsLine =
      existingTags.length > 0 ? existingTags.join(", ") : "none yet";
    const existingSupertagsLine =
      existingSupertags.length > 0 ? existingSupertags.join(", ") : "none yet";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            `You are tagging a study document for a student's note-taking app.\n\n` +
            `Existing broad subjects already in use — reuse the exact spelling when it fits:\n${existingSupertagsLine}\n\n` +
            `Existing specific tags already in use — reuse the exact spelling when the topic matches:\n${existingTagsLine}\n\n` +
            `Document excerpt:\n${text.slice(0, 600)}\n\n` +
            `Generate:\n` +
            `1. A "supertag": ONE broad subject area, 1-2 words, title-cased (e.g. "Biology", "Mathematics", "Computer Science").\n` +
            `2. "tags": 1-2 short, more specific tags for this document (e.g. "Cell Biology", "Linear Algebra").\n` +
            `Rules:\n` +
            `- Prefer reusing existing supertags/tags over inventing new ones\n` +
            `- The supertag must be broader than or equal to the tags (e.g. supertag "Biology", tag "Cell Biology")\n` +
            `- Do NOT use generic format/type labels like "Notes", "Homework", "Practice Problems", "Slides", or "Reading"\n` +
            `- Reply with a JSON object only, e.g. {"supertag": "Biology", "tags": ["Cell Biology"]}\n` +
            `- No explanation, no markdown`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
    let supertag: string | null = null;
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(extractJsonString(raw));
      if (typeof parsed.supertag === "string" && parsed.supertag.length > 0) {
        supertag = parsed.supertag;
      }
      if (Array.isArray(parsed.tags)) {
        tags = parsed.tags.filter((t: unknown) => typeof t === "string" && t.length > 0).slice(0, 2);
      }
    } catch {
      supertag = null;
      tags = [];
    }

    return NextResponse.json({ supertag, tags });
  } catch (err) {
    console.error("[/api/generate-tags]", err);
    return NextResponse.json({ error: "Failed to generate tags." }, { status: 500 });
  }
}

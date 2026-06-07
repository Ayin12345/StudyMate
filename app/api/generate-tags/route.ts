import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { userId, text } = await req.json() as { userId?: string; text?: string };
    if (!userId || !text?.trim()) {
      return NextResponse.json({ error: "userId and text are required" }, { status: 400 });
    }

    // Fetch all existing tags the user has already used
    const { data: docs } = await supabase
      .from("documents")
      .select("tags")
      .eq("session_id", userId);

    const existingTags = Array.from(
      new Set((docs ?? []).flatMap((d: { tags: string[] }) => d.tags))
    ).filter(Boolean);

    const existingTagsLine =
      existingTags.length > 0 ? existingTags.join(", ") : "none yet";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content:
            `You are tagging a study document for a student's note-taking app.\n\n` +
            `Existing tags already in use — reuse the exact spelling when the topic matches:\n${existingTagsLine}\n\n` +
            `Document excerpt:\n${text.slice(0, 600)}\n\n` +
            `Generate 1–3 short tags for this document.\n` +
            `Rules:\n` +
            `- Prefer reusing existing tags over inventing new ones\n` +
            `- Tags are 1–3 words, title-cased (e.g. "Computer Science", "Practice Problems")\n` +
            `- Reply with a JSON array only, e.g. ["Computer Science", "Notes"]\n` +
            `- No explanation, no markdown`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "[]";
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t) => typeof t === "string" && t.length > 0).slice(0, 3);
      }
    } catch {
      tags = [];
    }

    return NextResponse.json({ tags });
  } catch (err) {
    console.error("[/api/generate-tags]", err);
    return NextResponse.json({ error: "Failed to generate tags." }, { status: 500 });
  }
}

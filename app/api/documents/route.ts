import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chunkText } from "@/lib/chunker";
import { getEmbedding, EMBEDDING_MODEL } from "@/lib/embed";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id, tags, title, text, date")
    .eq("session_id", userId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[GET /api/documents]", error);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { userId?: string; tags?: string[]; title?: string; text?: string };
  const { userId, tags, title, text } = body;

  if (!userId || !title?.trim() || !text?.trim() || !Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: "userId, title, tags, and text are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({ session_id: userId, tags, title: title.trim(), text: text.trim() })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/documents]", error);
    return NextResponse.json({ error: "Failed to save document." }, { status: 500 });
  }

  // Chunk, embed, and store vectors
  try {
    const chunks = chunkText(data.text);
    const chunkRows = await Promise.all(
      chunks.map(async (content, position) => {
        const embedding = await getEmbedding(content);
        return {
          document_id: data.id,
          position,
          content,
          embedding: JSON.stringify(embedding),
          embedding_model: EMBEDDING_MODEL,
        };
      })
    );

    const { error: chunkError } = await supabase.from("chunks").insert(chunkRows);
    if (chunkError) throw chunkError;
  } catch (err) {
    console.error("[POST /api/documents] chunking/embedding failed", err);
    await supabase.from("documents").delete().eq("id", data.id);
    return NextResponse.json(
      { error: "Document saved but embedding failed. Please try uploading again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ document: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    console.error("[DELETE /api/documents]", error);
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

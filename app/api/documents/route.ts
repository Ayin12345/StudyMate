import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id, session_id, subject, title, text, date")
    .eq("session_id", sessionId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[GET /api/documents]", error);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { sessionId?: string; subject?: string; title?: string; text?: string };
  const { sessionId, subject, title, text } = body;

  if (!sessionId || !subject?.trim() || !title?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "sessionId, subject, title, and text are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({ session_id: sessionId, subject: subject.trim(), title: title.trim(), text: text.trim() })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/documents]", error);
    return NextResponse.json({ error: "Failed to save document." }, { status: 500 });
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

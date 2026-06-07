import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GET /api/sessions]", error);
    return NextResponse.json({ error: "Failed to load sessions." }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await req.json() as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId, title: null })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/sessions]", error);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }

  return NextResponse.json({ session: data });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { title } = await req.json() as { title?: string };
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sessions")
    .update({ title })
    .eq("id", id);

  if (error) {
    console.error("[PATCH /api/sessions]", error);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

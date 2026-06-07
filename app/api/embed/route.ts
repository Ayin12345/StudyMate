import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding } from '@/lib/embed';

export async function POST(req: NextRequest) {
  const { text } = await req.json() as { text?: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const embedding = await getEmbedding(text);
    return NextResponse.json({ embedding });
  } catch (err) {
    console.error('[POST /api/embed]', err);
    return NextResponse.json({ error: 'Failed to embed text.' }, { status: 500 });
  }
}

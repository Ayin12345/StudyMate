import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await pdfParse(buffer);
    const text: string = result.text ?? "";
    const scanned = text.trim().length === 0;

    return NextResponse.json({ text, scanned });
  } catch (err) {
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: "Failed to extract text from PDF." }, { status: 500 });
  }
}

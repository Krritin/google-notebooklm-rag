import { NextResponse } from "next/server";
import { ingestFile } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/octet-stream",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const name = file.name || "upload";
    const isPdf = name.toLowerCase().endsWith(".pdf");
    const isText = /\.(txt|md|markdown)$/i.test(name);
    if (!ACCEPTED.has(file.type) && !isPdf && !isText) {
      return NextResponse.json(
        { error: "Only PDF or plain-text files are supported." },
        { status: 415 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 25 MB limit." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestFile({
      buffer,
      filename: name,
      mimeType: file.type,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("upload error", err);
    return NextResponse.json(
      { error: err?.message || "Indexing failed." },
      { status: 500 },
    );
  }
}

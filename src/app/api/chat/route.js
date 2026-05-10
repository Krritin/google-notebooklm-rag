import { NextResponse } from "next/server";
import { answerQuery } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { collectionName, query, k } = await request.json();

    if (!collectionName || typeof collectionName !== "string") {
      return NextResponse.json(
        { error: "Upload a document before asking questions." },
        { status: 400 },
      );
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "Query cannot be empty." },
        { status: 400 },
      );
    }

    const result = await answerQuery({
      collectionName,
      query: query.trim(),
      k: typeof k === "number" ? k : 4,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { error: err?.message || "Could not generate an answer." },
      { status: 500 },
    );
  }
}

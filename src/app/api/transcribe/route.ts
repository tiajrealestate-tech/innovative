import { NextRequest, NextResponse } from "next/server";
import { transcribeFromUrl } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro)

// POST { audioUrl } -> { transcript }
export async function POST(req: NextRequest) {
  try {
    const { audioUrl } = await req.json();
    if (!audioUrl || typeof audioUrl !== "string") {
      return NextResponse.json(
        { error: "Missing audioUrl." },
        { status: 400 }
      );
    }

    const transcript = await transcribeFromUrl(audioUrl);
    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Transcription failed." },
      { status: 500 }
    );
  }
}

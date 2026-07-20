import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Issues a short-lived token so the BROWSER can upload the voice memo straight
// to Vercel Blob storage. This is what lets us accept 20–60 MB recordings — the
// file never passes through this function (serverless bodies are capped at a
// few MB), it goes directly to Blob and we just get back a URL.
// -----------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "audio/mp4",
          "audio/x-m4a",
          "audio/m4a",
          "audio/aac",
          "audio/mpeg",
          "audio/mp3",
          "audio/wav",
          "audio/x-wav",
          "audio/webm",
          "audio/ogg",
          "video/mp4", // iPhone voice memos are sometimes reported as this
          "application/octet-stream",
        ],
        maximumSizeInBytes: 250 * 1024 * 1024, // 250 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Nothing to do — we read the returned URL on the client and pass it on.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

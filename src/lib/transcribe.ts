// -----------------------------------------------------------------------------
// Speech-to-text via Deepgram.
//
// Why Deepgram (rather than OpenAI Whisper) for this specific tool:
//   - A full-house voice memo can be 20–60 MB / 30–60 min. Deepgram accepts the
//     audio by URL and streams it server-side, so we never have to download the
//     file into our own function or worry about Whisper's 25 MB upload cap.
//   - "keyterm" prompting lets us boost home-inspection jargon (GFCI, soffit,
//     fascia, flashing, etc.) for better accuracy on the words that matter.
//   - It is a little cheaper than Whisper.
// The rest of the app only depends on `transcribeFromUrl` returning a string,
// so this provider can be swapped later without touching anything else.
// -----------------------------------------------------------------------------

// A few domain terms Deepgram should be primed to recognize.
const KEYTERMS = [
  "GFCI",
  "AFCI",
  "soffit",
  "fascia",
  "flashing",
  "TPR valve",
  "weep screed",
  "efflorescence",
  "double tapped",
  "reverse polarity",
  "condensate",
  "downspout",
  "sub panel",
];

export async function transcribeFromUrl(audioUrl: string): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not set on the server.");
  }

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
  });
  for (const term of KEYTERMS) params.append("keyterm", term);

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Transcription failed (${res.status}). ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as any;
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

  if (!transcript.trim()) {
    throw new Error(
      "The recording was transcribed but came back empty. Is there audible speech in the file?"
    );
  }

  return transcript.trim();
}

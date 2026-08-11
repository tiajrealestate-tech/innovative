// Client-side helpers for Hey Hyper photo handling, shared by the front-page
// card and the Review-tab panel.

export type HyImage = { data: string; media_type: string };

// Vercel rejects request bodies over ~4.5 MB with a non-JSON error page, so
// keep the base64 payload comfortably under that.
const BODY_BUDGET_BYTES = 3_300_000;

function approxBytes(images: HyImage[]): number {
  // base64 inflates by 4/3, so decoded size ≈ length * 3/4.
  return images.reduce((n, img) => n + Math.floor(img.data.length * 0.75), 0);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawScaled(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}

// Read a picked file into a downscaled base64 JPEG — phone photos are huge;
// 1600px is plenty for analysis.
export async function fileToHyImage(file: File): Promise<HyImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { data: drawScaled(img, 1600, 0.82), media_type: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A big batch of 1600px photos can still exceed the request budget. Re-encode
// smaller (dimensions scale with the square root of the size ratio) until the
// batch fits; analysis quality holds up fine down to ~900px.
export async function shrinkToBudget(images: HyImage[]): Promise<HyImage[]> {
  let current = images;
  for (const maxDim of [1300, 1000, 900]) {
    if (approxBytes(current) <= BODY_BUDGET_BYTES) return current;
    current = await Promise.all(
      current.map(async (img) => {
        const el = await loadImage(`data:${img.media_type};base64,${img.data}`);
        return { data: drawScaled(el, maxDim, 0.72), media_type: "image/jpeg" };
      })
    );
  }
  return current;
}

export function batchTooLarge(images: HyImage[]): boolean {
  return approxBytes(images) > BODY_BUDGET_BYTES;
}

// Read the /api/hyper response, degrading gracefully when the body isn't JSON
// (platform error pages: 413 too large, 504 timeout, …).
export async function readHyperResponse(res: Response): Promise<any> {
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (res.status === 413) {
      throw new Error(
        "That batch of photos is too large to send in one go — remove a couple with the ✕ and ask again."
      );
    }
    if (res.status === 504 || res.status === 408 || res.status === 502) {
      throw new Error(
        "Hyper took too long on that batch and the request timed out — try again, or ask with fewer photos."
      );
    }
    throw new Error(
      `The photo check hit a server error (${res.status}). Give it a moment and try again.`
    );
  }
  if (!res.ok) throw new Error(data?.error || "Could not analyze the photos.");
  return data;
}

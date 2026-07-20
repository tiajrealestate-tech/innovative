# Voice-to-Report

Turn a home inspector's walkthrough **voice memo** into **structured, Spectora-ready report content** — with a review screen and three export formats.

This is version 1: a working prototype meant to be used on real inspections.

---

## ▶️ Test it — the easy way (one click)

Click this button. It walks you through putting the app online (no coding):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftiajrealestate-tech%2Finnovative&env=ANTHROPIC_API_KEY%2CDEEPGRAM_API_KEY%2CAPP_PASSWORD&envDescription=Your%20Claude%20key%2C%20Deepgram%20key%2C%20and%20any%20password%20to%20open%20the%20app)

When it asks for the three values:

- `ANTHROPIC_API_KEY` — your Claude key (see **Step 1** below). **Required.**
- `APP_PASSWORD` — make up any password. **Required.**
- `DEEPGRAM_API_KEY` — for turning audio into text (see **Step 2**). You can leave this blank for now and add it later.

**Fastest possible test (only needs the Claude key):** after it deploys, open the URL, enter your password, and on the upload page click **"Or paste a transcript."** Type a few findings like you'd say them out loud, hit **Create report**, and you'll see the whole review-and-export flow. To test real **audio** uploads, add the Deepgram key and turn on Blob storage (**Step 2** and **Step 5** below).

---

## What it does (the workflow)

1. **Upload** an iPhone voice memo (`.m4a`, or `.mp3` / `.wav` / `.aac`), and optionally type in the property address, date, client, and agent.
2. The app **transcribes** the audio to text (Deepgram) and then uses the **Claude AI** to break it into individual findings — each with a report section, polished comment, severity, and recommendation.
3. You land on a **review screen** where you can edit anything, change severities, delete, or add findings by hand.
4. You export in three formats:
   - **Report entry** — findings in Spectora's section order, each with a one-click **Copy** button and the severity + recommendation shown next to it, so you can check the matching boxes fast while pasting.
   - **Client punch list** — a clean, color-coded page (red / orange / yellow / gray) with summary counts, ready to print or save as PDF for the client.
   - **CSV** for Airtable/Excel, plus a **JSON** export (the "universal" data file — see below).

---

## Why it's built to grow beyond Spectora

The whole app is organized around one clean data format (see `src/lib/schema.ts`, the "Universal Inspection Findings Schema"). Every screen and every export is just a **rendering** of that format. That means a future version can push these same findings **into any inspection software** — via that software's API, a Wizzy-style browser extension, or an AI computer-use agent — by adding one small "adapter" that reads this format. Nothing here is locked to Spectora, and the JSON export is exactly what that future adapter will consume.

---

## The tech (kept simple + cheap)

| Piece | What it is | Cost |
|---|---|---|
| **Next.js** (React) | The web app itself (pages + the behind-the-scenes API) | Free |
| **Vercel** | Hosting — connect your GitHub repo and it deploys automatically | Free tier is enough |
| **Vercel Blob** | Storage for the (large) audio files during processing | Pennies |
| **Deepgram** | Speech-to-text | ~$0.0043/min (a 40-min memo ≈ **$0.17**) |
| **Claude (Anthropic)** | The AI that structures the findings | A few cents per inspection |

**Roughly $0.15–0.30 in API costs per inspection.** Hosting is free at this volume.

> **Why Deepgram instead of OpenAI Whisper?** A full-house voice memo can be 20–60 MB / 30–60 minutes. Deepgram accepts the audio by URL and has no small file-size cap, so long recordings "just work" without splitting them up. It's also a bit cheaper and lets us boost inspection jargon (GFCI, soffit, fascia…). Whisper caps uploads at 25 MB, which real recordings blow past. If you'd ever prefer Whisper, only `src/lib/transcribe.ts` needs to change.

---

# SETUP — step by step

You'll create **3 accounts** and paste **4 values** into Vercel. No coding required. Takes about 20 minutes.

### Step 1 — Get your Claude (Anthropic) API key

1. Go to **https://console.anthropic.com** and sign up / log in with `tiaj.realestate@gmail.com`.
2. Add a payment method under **Settings → Billing** (put ~$5 of credit on it to start).
3. Go to **Settings → API Keys → Create Key**. Name it "voice-to-report".
4. **Copy the key** (starts with `sk-ant-...`). You won't be able to see it again, so paste it somewhere safe for a minute. This is your `ANTHROPIC_API_KEY`.

### Step 2 — Get your Deepgram API key (transcription)

1. Go to **https://console.deepgram.com** and sign up (they give you free credit to start).
2. In the dashboard, go to **API Keys → Create a New API Key**. Give it a name and the default permissions.
3. **Copy the key.** This is your `DEEPGRAM_API_KEY`.

### Step 3 — Put the code on GitHub

The code already lives in your repo (`tiajrealestate-tech/innovative`). You just need it on the `main` branch, or you can deploy this branch directly. Nothing to do here if a teammate already pushed it.

### Step 4 — Deploy on Vercel

1. Go to **https://vercel.com** and sign up **with your GitHub account**.
2. Click **Add New → Project**, and **import** the `tiajrealestate-tech/innovative` repo.
3. Before clicking Deploy, expand **Environment Variables** and add these three (name on the left, value on the right):
   - `ANTHROPIC_API_KEY` → the key from Step 1
   - `DEEPGRAM_API_KEY` → the key from Step 2
   - `APP_PASSWORD` → any password you choose (this is what opens the app)
4. Click **Deploy**. Wait ~1 minute. You'll get a live URL like `https://innovative-xxxx.vercel.app`.

### Step 5 — Turn on Blob storage (for large audio files)

1. In your new Vercel project, go to the **Storage** tab → **Create Database → Blob** → **Create**.
2. When it asks to connect it to the project, say **yes**. This automatically adds the `BLOB_READ_WRITE_TOKEN` variable for you.
3. Go to the **Deployments** tab → click the **⋯** on the latest deployment → **Redeploy** (so it picks up the new Blob variable).

### Done

Open your Vercel URL, enter the `APP_PASSWORD`, and try it with a real voice memo. 🎉

> **Tip:** No memo handy? On the upload page click **"Or paste a transcript"** and type a few findings by hand to see the whole flow — this works even before Deepgram/Blob are set up.

---

## Running it on your own computer (optional)

If you ever want to run it locally:

1. Install **Node.js** (LTS) from https://nodejs.org.
2. In a terminal, from this folder: `npm install`
3. Copy `.env.example` to a new file named `.env.local` and fill in your four values.
4. `npm run dev`, then open **http://localhost:3000**.

---

## Notes / known limitations (v1)

- **File length:** a single Vercel free-tier function can run for 60 seconds. Very long recordings (~45+ min) usually still finish, but if transcription times out, upgrading to **Vercel Pro** raises the limit to 300s. The code is already set for this (`maxDuration = 60`).
- **Login:** a single shared password protects the app so strangers can't spend your API credits. It's intentionally simple for one user; a future version can add real per-user accounts.
- **Security advisories:** `npm audit` flags some Next.js denial-of-service advisories that only fully patch in Next 16 (a big upgrade). They affect features this app doesn't use (image optimization remote patterns, rewrites), so they're low risk here — worth upgrading in a later version, not blocking for v1.
- **Data:** the in-progress report lives in your browser (no database) until you export it. Exporting the JSON/CSV is how you keep a copy.

## Where things live (for whoever edits next)

```
src/lib/schema.ts        <- the universal data format (the core contract)
src/lib/taxonomy.ts      <- report sections/subsections (swap per software here)
src/lib/severity.ts      <- severity levels + colors
src/lib/recommendations.ts
src/lib/prompt.ts        <- the instructions given to Claude
src/lib/transcribe.ts    <- Deepgram (swap transcription provider here)
src/app/page.tsx         <- upload page
src/app/review/page.tsx  <- review + the 3 output views
src/app/api/*            <- the server routes (login, upload, transcribe, structure)
```

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/inspections -> the inspector's recent Spectora jobs
//
// Spectora's public API (connect.spectora.com) exposes the BUSINESS record of
// an inspection — address, client, agent, date — but nothing about report
// content. That's enough to stop the address/client/date being retyped for
// every report: pick the job, and these fields fill themselves in.
export interface SpectoraJob {
  id: string;
  address: string;
  client: string;
  agent: string;
  date: string; // ISO
  date_label: string;
  inspector: string;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.SPECTORA_API_KEY;
  if (!apiKey) {
    // Not configured is not an error: the app works fine without it, the
    // picker just stays hidden.
    return NextResponse.json({ configured: false, jobs: [] });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").toLowerCase();

  try {
    const res = await fetch(
      "https://connect.spectora.com/v2/inspections?" +
        new URLSearchParams({ "page[size]": "100", sort: "-datetime" }),
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { configured: true, jobs: [], error: `Spectora returned ${res.status}.` },
        { status: 200 }
      );
    }
    const body = (await res.json()) as any;
    const jobs: SpectoraJob[] = (body?.data || []).map((row: any) => {
      const a = row?.attributes || {};
      return {
        id: String(row?.id ?? ""),
        address: a.full_address || a.property_address || "",
        client: a.buyer_name || (a.buyer_names || []).join(", ") || "",
        agent: a.buying_agent_name || a.selling_agent_name || "",
        date: a.datetime || "",
        date_label: a.datetime_formatted || a.datetime || "",
        inspector: a.inspector_name || "",
      };
    });
    const filtered = q
      ? jobs.filter((j) =>
          `${j.address} ${j.client} ${j.agent}`.toLowerCase().includes(q)
        )
      : jobs;
    return NextResponse.json({ configured: true, jobs: filtered.slice(0, 40) });
  } catch (error) {
    return NextResponse.json(
      { configured: true, jobs: [], error: (error as Error).message },
      { status: 200 }
    );
  }
}

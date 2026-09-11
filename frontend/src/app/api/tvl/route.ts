import { NextResponse } from "next/server";
import { LLAMA } from "@/lib/genlayer";

export const revalidate = 3600;

/**
 * A protocol's TVL history, downsampled.
 *
 * `/protocol/{slug}` is where the series lives and it is not small — 2 MB for
 * GMX, 29 MB for Aave V3 — because the same document carries per-token balances
 * for every day of the protocol's life. There is no lighter endpoint; this was
 * measured against every candidate DeFi Llama publishes (docs/PROBE.md §1).
 *
 * So: fetched on the server, cached for an hour, reduced to ~180 points, and
 * guarded by a size ceiling so one enormous protocol cannot exhaust the
 * function's memory. A chart that cannot be drawn says so; it does not hang.
 */
const MAX_BYTES = 40 * 1024 * 1024;
const POINTS = 180;

export async function GET(request: Request) {
  const slug = (new URL(request.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9.-]{1,80}$/.test(slug)) {
    return NextResponse.json({ ok: false, reason: "bad slug" }, { status: 400 });
  }

  try {
    const res = await fetch(`${LLAMA}/protocol/${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reason: res.status === 400
          ? "DeFi Llama has no detail document for this slug."
          : `DeFi Llama answered ${res.status}.`,
      });
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) {
      return NextResponse.json({
        ok: false,
        reason: `The history document is ${(length / 1e6).toFixed(0)} MB, past this page's ceiling.`,
      });
    }

    const doc = (await res.json()) as {
      name?: string;
      tvl?: { date?: number; totalLiquidityUSD?: number }[];
    };
    const series = Array.isArray(doc.tvl) ? doc.tvl : [];
    const clean = series
      .filter((p) => p && Number(p.date) > 0 && Number.isFinite(Number(p.totalLiquidityUSD)))
      .map((p) => ({ t: Number(p.date), v: Math.max(0, Number(p.totalLiquidityUSD)) }))
      .sort((a, b) => a.t - b.t);

    if (clean.length === 0) {
      return NextResponse.json({ ok: false, reason: "No TVL history is published for this protocol." });
    }

    // Downsample by taking the MAXIMUM of each bucket rather than the first
    // point in it: a mean smooths away the all-time peak, and the peak is the
    // figure the TVL-health score is measured against — losing it would make
    // the chart contradict the rating printed beside it.
    const step = Math.max(1, Math.ceil(clean.length / POINTS));
    const points: { t: number; v: number }[] = [];
    for (let i = 0; i < clean.length; i += step) {
      let best = clean[i];
      for (let j = i; j < Math.min(i + step, clean.length); j++) {
        if (clean[j].v > best.v) best = clean[j];
      }
      points.push(best);
    }
    const last = clean[clean.length - 1];
    if (points[points.length - 1]?.t !== last.t) points.push(last);

    const peak = clean.reduce((m, p) => (p.v > m.v ? p : m), clean[0]);
    return NextResponse.json({
      ok: true,
      slug,
      name: doc.name ?? slug,
      points,
      peak,
      current: last,
      first: clean[0],
      raw_points: clean.length,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      reason: `Could not read the history: ${(e as Error).message.slice(0, 140)}`,
    });
  }
}

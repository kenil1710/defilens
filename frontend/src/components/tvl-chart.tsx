"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usd } from "@/lib/format";

type Point = { t: number; v: number };
type Data = {
  ok: boolean;
  reason?: string;
  points?: Point[];
  peak?: Point;
  current?: Point;
  first?: Point;
  raw_points?: number;
};

const W = 720;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 24, left: 52 };

/**
 * Total value locked over the protocol's whole life.
 *
 * One series, so no legend — the heading names it. The PEAK is marked, because
 * peak is the figure the TVL-health dimension is measured against, and a chart
 * that did not show it would leave the score beside it unexplained.
 */
export function TvlChart({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tvl?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ ok: false, reason: "The history could not be loaded." }));
    return () => { cancelled = true; };
  }, [slug]);

  const geom = useMemo(() => {
    const pts = data?.points ?? [];
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.t);
    const ys = pts.map((p) => p.v);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y1 = Math.max(...ys) * 1.08 || 1;
    const px = (t: number) => PAD.left + ((t - x0) / Math.max(1, x1 - x0)) * (W - PAD.left - PAD.right);
    const py = (v: number) => H - PAD.bottom - (v / y1) * (H - PAD.top - PAD.bottom);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join("");
    const area = `${line}L${px(x1).toFixed(1)},${H - PAD.bottom}L${px(x0).toFixed(1)},${H - PAD.bottom}Z`;
    const ticks = [0, y1 / 2, y1].map((v) => ({ v, y: py(v) }));
    return { pts, px, py, line, area, ticks, x0, x1, y1 };
  }, [data]);

  if (!data) {
    return <div className="bg-wash h-[200px] animate-pulse rounded-lg" aria-hidden />;
  }
  if (!data.ok || !geom) {
    return (
      <div className="border-rule text-ink-3 flex h-[200px] items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm">
        {data.reason ?? "No history to chart."}
      </div>
    );
  }

  const { pts, px, py, line, area, ticks } = geom;
  const peak = data.peak;
  const hovered = hover === null ? null : pts[hover];

  return (
    <figure className="m-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Total value locked from ${fmtDate(data.first?.t)} to ${fmtDate(data.current?.t)}, peaking at ${usd(peak?.v)}`}
        onMouseMove={(e) => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0, bestD = Infinity;
          pts.forEach((p, i) => {
            const d = Math.abs(px(p.t) - x);
            if (d < bestD) { bestD = d; best = i; }
          });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* recessive grid */}
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke="#e7e5e4" strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 3.5} textAnchor="end" fontSize="10" fill="#a8a29e"
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {usd(t.v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="#2563eb" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* the peak, labelled — it is what the TVL-health score is measured against */}
        {peak && (
          <g>
            <circle cx={px(peak.t)} cy={py(peak.v)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
            <text
              x={Math.min(Math.max(px(peak.t), PAD.left + 26), W - PAD.right - 26)}
              y={Math.max(py(peak.v) - 9, 11)}
              textAnchor="middle" fontSize="10" fontWeight="600" fill="#44403c"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              peak {usd(peak.v)}
            </text>
          </g>
        )}

        {/* x extent */}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="#a8a29e">{fmtDate(data.first?.t)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="10" fill="#a8a29e">
          {fmtDate(data.current?.t)}
        </text>

        {/* hover crosshair */}
        {hovered && (
          <g pointerEvents="none">
            <line x1={px(hovered.t)} x2={px(hovered.t)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={px(hovered.t)} cy={py(hovered.v)} r="4" fill="#2563eb"
              stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>

      <figcaption className="text-ink-3 mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {hovered ? (
            <span className="text-ink font-medium">
              <span className="tnum">{usd(hovered.v)}</span>
              <span className="text-ink-3 font-normal"> on {fmtDate(hovered.t)}</span>
            </span>
          ) : (
            <>Total value locked, from DeFi Llama. Hover for a date.</>
          )}
        </span>
        <span className="tnum">
          {data.raw_points} daily points
        </span>
      </figcaption>
    </figure>
  );
}

function fmtDate(t?: number): string {
  if (!t) return "—";
  return new Date(t * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

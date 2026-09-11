"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { VerdictBadge } from "./verdict-badge";
import { usd, verdictTone, scoreTone } from "@/lib/format";
import { TimeAgo } from "./time-ago";
import type { ProtocolSummary, Verdict } from "@/lib/types";

type SortKey = "score" | "tvl" | "recent" | "name";

/**
 * Every rating, as cards, filterable.
 *
 * The score arc on each card is the thing the eye lands on, so a page of these
 * can be read by shape before a word of it is read — which is the whole point
 * of a ratings index. Filters are client-side because the entire set arrives in
 * one contract read and re-fetching per keystroke would spend Studio's
 * per-minute budget to re-sort an array already in memory.
 */
export function ProtocolCards({
  protocols,
  categoryGroups,
  chainsBySlug = {},
}: {
  protocols: ProtocolSummary[];
  categoryGroups: Record<string, string[]>;
  chainsBySlug?: Record<string, string[]>;
}) {
  const [verdict, setVerdict] = useState<Verdict | "ALL">("ALL");
  const [group, setGroup] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("score");
  const [query, setQuery] = useState("");

  const groupNames = useMemo(
    () => ["ALL", ...Object.keys(categoryGroups).filter((g) =>
      protocols.some((p) => categoryGroups[g].includes(p.category)),
    )],
    [categoryGroups, protocols],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = protocols.filter((p) => {
      if (verdict !== "ALL" && p.verdict !== verdict) return false;
      if (group !== "ALL" && !categoryGroups[group]?.includes(p.category)) return false;
      if (q && !p.slug.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const by: Record<SortKey, (a: ProtocolSummary, b: ProtocolSummary) => number> = {
      score: (a, b) => b.overall_score - a.overall_score || a.slug.localeCompare(b.slug),
      tvl: (a, b) => Number(b.tvl_usd) - Number(a.tvl_usd) || a.slug.localeCompare(b.slug),
      recent: (a, b) => Number(b.last_analyzed) - Number(a.last_analyzed),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...filtered].sort(by[sort]);
  }, [protocols, verdict, group, sort, query, categoryGroups]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: protocols.length };
    for (const p of protocols) c[p.verdict] = (c[p.verdict] ?? 0) + 1;
    return c;
  }, [protocols]);

  const clear = () => {
    setVerdict("ALL");
    setGroup("ALL");
    setQuery("");
  };

  return (
    <div>
      {/* search first: it is the fastest route to a known protocol */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search protocols</span>
          <svg
            width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden
            className="text-ink-4 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.4" />
            <path d="m10.2 10.2 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or slug"
            className="border-rule-2 focus:border-accent w-full rounded-lg border bg-white py-2.5 pr-3 pl-9 text-sm outline-none"
          />
        </label>
        <div className="flex gap-2">
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Filter by category"
            className="border-rule-2 focus:border-accent min-w-0 flex-1 rounded-lg border bg-white px-3 py-2.5 text-sm outline-none sm:flex-none"
          >
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g === "ALL" ? "All categories" : g}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort by"
            className="border-rule-2 focus:border-accent min-w-0 flex-1 rounded-lg border bg-white px-3 py-2.5 text-sm outline-none sm:flex-none"
          >
            <option value="score">Highest score</option>
            <option value="tvl">Largest TVL</option>
            <option value="recent">Newest</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["ALL", "SAFE", "MODERATE", "HIGH_RISK", "UNKNOWN"] as const).map((v) => {
          const n = counts[v] ?? 0;
          if (v !== "ALL" && n === 0) return null;
          const active = verdict === v;
          const tone = verdictTone(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-ink bg-ink text-white"
                  : `border-rule-2 hover:bg-wash bg-white ${v === "ALL" ? "" : tone.fg}`
              }`}
            >
              {v === "ALL" ? "All" : v === "HIGH_RISK" ? "High risk" : v[0] + v.slice(1).toLowerCase()}
              <span className={`tnum ml-1.5 ${active ? "text-white/60" : "text-ink-4"}`}>{n}</span>
            </button>
          );
        })}
        <span className="text-ink-3 ml-auto text-xs">
          {rows.length} of {protocols.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-5 px-4 py-14 text-center">
          <p className="text-sm font-semibold">Nothing matches those filters</p>
          <p className="text-ink-3 mx-auto mt-1.5 max-w-[40ch] text-sm leading-relaxed">
            Clear them to see everything, or put a protocol nobody has looked at
            through the oracle.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
            >
              Clear filters
            </button>
            <Link
              href="/analyze"
              className="bg-accent hover:bg-accent-dark rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              Analyze a protocol
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.slug}>
              <Card p={p} chains={chainsBySlug[p.slug] ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({ p, chains }: { p: ProtocolSummary; chains: string[] }) {
  const tone = verdictTone(p.verdict);
  const unknown = p.verdict === "UNKNOWN";
  const score = unknown ? 0 : Number(p.overall_score) || 0;
  const st = scoreTone(score);

  return (
    <Link
      href={`/protocol/${p.slug}`}
      className={`card ${tone.tab} group block h-full px-5 py-5 transition-shadow hover:shadow-[0_1px_2px_rgb(28_25_23/0.05),0_12px_28px_-16px_rgb(28_25_23/0.22)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="group-hover:text-accent truncate font-semibold">{p.name}</h3>
          <p className="text-ink-4 truncate font-mono text-xs">{p.slug}</p>
        </div>
        <MiniArc score={score} unknown={unknown} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="border-rule bg-wash text-ink-2 rounded border px-2 py-0.5 text-[11px] font-medium">
          {p.category || "uncategorised"}
        </span>
        <VerdictBadge verdict={p.verdict} size="sm" />
      </div>

      <dl className="border-rule mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3.5">
        <div>
          <dt className="text-ink-3 text-[11px]">TVL</dt>
          <dd className="tnum text-sm font-semibold">{usd(p.tvl_usd)}</dd>
        </div>
        <div>
          <dt className="text-ink-3 text-[11px]">Rated</dt>
          <dd className="text-ink-2 text-sm"><TimeAgo epoch={p.last_analyzed} /></dd>
        </div>
      </dl>

      {chains.length > 0 && (
        <div className="mt-3">
          <p className="text-ink-3 text-[11px]">
            {chains.length} {chains.length === 1 ? "chain" : "chains"}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {chains.slice(0, 4).map((c) => (
              <li
                key={c}
                className="border-rule bg-wash text-ink-2 rounded border px-1.5 py-0.5 text-[10px]"
              >
                {c}
              </li>
            ))}
            {chains.length > 4 && (
              <li className="text-ink-4 px-1 py-0.5 text-[10px]">
                +{chains.length - 4} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* the score as a bar too, so the card is readable without colour alone */}
      <div className="mt-3.5">
        <div className="bg-wash h-1.5 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${unknown ? "bg-unknown" : st.bar}`}
            style={{ width: `${unknown ? 100 : Math.max(score, 2)}%`, opacity: unknown ? 0.25 : 1 }}
          />
        </div>
        <p className="text-ink-4 mt-1.5 text-[11px]">
          {unknown
            ? "no TVL history — cannot be scored"
            : `${p.analysis_count} assessment${p.analysis_count === 1 ? "" : "s"} on chain`}
        </p>
      </div>
    </Link>
  );
}

/** A small 270° arc — the same instrument as the detail page's gauge, sized for
 *  a card corner. Static: twenty animating arcs on one screen is a distraction,
 *  not an entrance. */
function MiniArc({ score, unknown }: { score: number; unknown: boolean }) {
  const size = 52;
  const stroke = 5;
  const r = (size - stroke) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const arc = (circ * 270) / 360;
  const filled = (arc * score) / 100;
  const color = unknown
    ? "var(--color-unknown)"
    : score >= 70
      ? "var(--color-safe)"
      : score >= 40
        ? "var(--color-moderate)"
        : "var(--color-risk)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-wash)"
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} />
        {!unknown && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} />
        )}
      </svg>
      <span
        className="tnum absolute inset-0 flex items-center justify-center text-sm font-bold"
        style={{ color: unknown ? "var(--color-ink-4)" : color }}
      >
        {unknown ? "—" : score}
      </span>
    </div>
  );
}

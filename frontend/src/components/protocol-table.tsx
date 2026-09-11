"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { VerdictBadge } from "./verdict-badge";
import { usd, ago, verdictTone } from "@/lib/format";
import type { ProtocolSummary, Verdict } from "@/lib/types";

type SortKey = "score" | "tvl" | "name" | "recent";

/**
 * The ledger. Every rating in one sortable, filterable table.
 *
 * A table rather than a grid of cards: twenty identical cards cannot be scanned
 * down a column, and comparing scores down a column is the entire job here.
 */
export function ProtocolTable({ protocols }: { protocols: ProtocolSummary[] }) {
  const [verdict, setVerdict] = useState<Verdict | "ALL">("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("score");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set(protocols.map((p) => p.category).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [protocols]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = protocols.filter((p) => {
      if (verdict !== "ALL" && p.verdict !== verdict) return false;
      if (category !== "ALL" && p.category !== category) return false;
      if (q && !p.slug.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const by: Record<SortKey, (a: ProtocolSummary, b: ProtocolSummary) => number> = {
      score: (a, b) => b.overall_score - a.overall_score || a.slug.localeCompare(b.slug),
      tvl: (a, b) => Number(b.tvl_usd) - Number(a.tvl_usd) || a.slug.localeCompare(b.slug),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => Number(b.last_analyzed) - Number(a.last_analyzed),
    };
    return [...filtered].sort(by[sort]);
  }, [protocols, verdict, category, sort, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: protocols.length };
    for (const p of protocols) c[p.verdict] = (c[p.verdict] ?? 0) + 1;
    return c;
  }, [protocols]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "SAFE", "MODERATE", "HIGH_RISK", "UNKNOWN"] as const).map((v) => {
          const active = verdict === v;
          const n = counts[v] ?? 0;
          if (v !== "ALL" && n === 0) return null;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-ink bg-ink text-white"
                  : "border-rule-2 hover:bg-wash bg-white"
              }`}
            >
              {v === "ALL" ? "All" : v === "HIGH_RISK" ? "High risk" : v[0] + v.slice(1).toLowerCase()}
              <span className={`tnum ml-1.5 ${active ? "text-white/60" : "text-ink-4"}`}>{n}</span>
            </button>
          );
        })}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a protocol"
            className="border-rule-2 focus:border-accent w-40 rounded-lg border bg-white px-3 py-1.5 text-sm outline-none"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border-rule-2 focus:border-accent rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none"
            aria-label="Filter by category"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === "ALL" ? "All categories" : c}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border-rule-2 focus:border-accent rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none"
            aria-label="Sort by"
          >
            <option value="score">Highest score</option>
            <option value="tvl">Largest TVL</option>
            <option value="name">Name</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
      </div>

      <div className="border-rule mt-5 overflow-x-auto rounded-xl border bg-white">
        <table className="ledger w-full min-w-[680px] text-sm">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Category</th>
              <th className="text-right">TVL</th>
              <th>Verdict</th>
              <th className="text-right">Score</th>
              <th className="text-right">Rated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const tone = verdictTone(p.verdict);
              return (
                <tr key={p.slug}>
                  <td>
                    <Link href={`/protocol/${p.slug}`} className="group flex items-center gap-2.5">
                      <span className={`h-7 w-0.5 rounded-full ${tone.bar}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="group-hover:text-accent block truncate font-medium">
                          {p.name}
                        </span>
                        <span className="text-ink-4 block truncate font-mono text-xs">{p.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-ink-2">{p.category || "—"}</td>
                  <td className="tnum text-right">{usd(p.tvl_usd)}</td>
                  <td><VerdictBadge verdict={p.verdict} size="sm" /></td>
                  <td className={`tnum text-right font-semibold ${tone.fg}`}>
                    {p.verdict === "UNKNOWN" ? "—" : p.overall_score}
                  </td>
                  <td className="text-ink-3 text-right text-xs whitespace-nowrap">
                    {ago(p.last_analyzed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">Nothing matches those filters</p>
            <p className="text-ink-3 mx-auto mt-1.5 max-w-[38ch] text-sm leading-relaxed">
              Clear a filter, or rate a protocol nobody has looked at yet.
            </p>
            <Link
              href="/analyze"
              className="text-accent hover:text-accent-dark mt-3 inline-block text-sm font-semibold"
            >
              Rate a protocol
            </Link>
          </div>
        )}
      </div>

      <p className="text-ink-3 mt-3 text-xs">
        Showing {rows.length} of {protocols.length} rated protocols.
      </p>
    </div>
  );
}

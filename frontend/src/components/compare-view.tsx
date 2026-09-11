"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { VerdictBadge, ScoreMark } from "./verdict-badge";
import { usd, age, pct, verdictTone, scoreTone, VERDICT_COPY } from "@/lib/format";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import type { Assessment, Dimension, ProtocolSummary } from "@/lib/types";

/**
 * Two protocols, side by side, on the same rubric.
 *
 * A comparison only means something because both sides went through identical
 * arithmetic — so the dimension rows are the spine of the layout, and the row
 * with the biggest gap is marked, because that is the answer to "why does one
 * score higher".
 */
export function CompareView({
  protocols,
  assessments,
  initial,
}: {
  protocols: ProtocolSummary[];
  assessments: Record<string, Assessment>;
  initial: [string, string];
}) {
  const [left, setLeft] = useState(initial[0]);
  const [right, setRight] = useState(initial[1]);

  const a = assessments[left];
  const b = assessments[right];

  const widest = useMemo(() => {
    if (!a || !b) return null;
    let key: Dimension = DIMENSIONS[0];
    let gap = -1;
    for (const d of DIMENSIONS) {
      const g = Math.abs(Number(a.scores[d] ?? 0) - Number(b.scores[d] ?? 0));
      if (g > gap) { gap = g; key = d; }
    }
    return gap > 0 ? { key, gap } : null;
  }, [a, b]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Picker label="First protocol" value={left} onChange={setLeft} protocols={protocols} exclude={right} />
        <Picker label="Second protocol" value={right} onChange={setRight} protocols={protocols} exclude={left} />
      </div>

      {!a || !b ? (
        <p className="text-ink-3 mt-8 text-sm">Pick two rated protocols to compare.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Header a={a} winner={a.overall_score > b.overall_score} />
            <Header a={b} winner={b.overall_score > a.overall_score} />
          </div>

          <VerdictCompare a={a} b={b} />

          <div className="border-rule mt-6 overflow-hidden rounded-xl border bg-white">
            {DIMENSIONS.map((key) => {
              const meta = DIMENSION_META[key];
              const av = Number(a.scores[key] ?? 0);
              const bv = Number(b.scores[key] ?? 0);
              const marked = widest?.key === key;
              return (
                <div
                  key={key}
                  className={`border-rule grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-4 py-3.5 last:border-b-0 sm:px-6 ${
                    marked ? "bg-accent-wash/50" : ""
                  }`}
                >
                  <Side score={av} align="right" />
                  <div className="w-32 text-center sm:w-44">
                    <p className="text-xs font-medium">{meta.label}</p>
                    <p className="text-ink-4 tnum text-[11px]">{meta.weight}%</p>
                  </div>
                  <Side score={bv} align="left" />
                </div>
              );
            })}
            <div className="border-rule grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t bg-[#fafaf9] px-4 py-4 sm:px-6">
              <p className={`tnum text-right text-2xl font-bold ${
                a.overall_score > b.overall_score ? "text-safe" : a.overall_score < b.overall_score ? "text-ink-3" : ""
              }`}>
                {a.overall_score}
              </p>
              <p className="w-32 text-center text-xs font-semibold sm:w-44">Overall</p>
              <p className={`tnum text-2xl font-bold ${
                b.overall_score > a.overall_score ? "text-safe" : b.overall_score < a.overall_score ? "text-ink-3" : ""
              }`}>
                {b.overall_score}
              </p>
            </div>
          </div>

          {widest && (
            <p className="text-ink-2 mt-4 max-w-[70ch] text-sm leading-relaxed">
              The widest gap is{" "}
              <span className="font-medium">{DIMENSION_META[widest.key].lower}</span>
              , {widest.gap} points apart — worth {DIMENSION_META[widest.key].weight}% of
              each score.{" "}
              {Number(a.scores[widest.key]) > Number(b.scores[widest.key]) ? a.name : b.name}{" "}
              leads it.
            </p>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Evidence a={a} />
            <Evidence a={b} />
          </div>
        </>
      )}
    </div>
  );
}

/** The headline answer, in a sentence, before the reader works through five
 *  dimension rows. A comparison whose conclusion is only implicit in a table is
 *  a comparison the reader has to finish themselves. */
function VerdictCompare({ a, b }: { a: Assessment; b: Assessment }) {
  const tie = a.overall_score === b.overall_score;
  const lead = a.overall_score >= b.overall_score ? a : b;
  const trail = lead === a ? b : a;
  const gap = Math.abs(a.overall_score - b.overall_score);
  const sameVerdict = a.verdict === b.verdict;
  return (
    <div className="border-rule bg-wash/60 mt-4 rounded-xl border px-5 py-4">
      <p className="text-ink-2 text-sm leading-relaxed">
        {tie ? (
          <>
            <span className="text-ink font-semibold">{a.name}</span> and{" "}
            <span className="text-ink font-semibold">{b.name}</span> score the same
            overall — {a.overall_score}/100 each. The dimensions below are where
            they actually differ.
          </>
        ) : (
          <>
            <span className="text-ink font-semibold">{lead.name}</span> rates{" "}
            <span className="text-safe font-semibold">{gap} point{gap === 1 ? "" : "s"} higher</span>{" "}
            than <span className="text-ink font-semibold">{trail.name}</span>
            {sameVerdict ? (
              <> — though both land in the same verdict band.</>
            ) : (
              <>
                , and the two land in different bands:{" "}
                <span className="font-medium">{VERDICT_COPY[lead.verdict]?.label ?? lead.verdict}</span>{" "}
                against{" "}
                <span className="font-medium">{VERDICT_COPY[trail.verdict]?.label ?? trail.verdict}</span>.
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}

function Picker({
  label, value, onChange, protocols, exclude,
}: {
  label: string; value: string; onChange: (v: string) => void;
  protocols: ProtocolSummary[]; exclude: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-rule-2 focus:border-accent w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none"
      >
        {protocols
          .filter((p) => p.slug !== exclude)
          .map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} — {p.verdict === "UNKNOWN" ? "unrated" : `${p.overall_score}/100`}
            </option>
          ))}
      </select>
    </label>
  );
}

function Header({ a, winner }: { a: Assessment; winner: boolean }) {
  const tone = verdictTone(a.verdict);
  return (
    <div
      className={`card ${tone.tab} relative px-5 py-4 ${
        winner ? "ring-safe/40 shadow-[0_1px_2px_rgb(28_25_23/0.04),0_10px_28px_-16px_rgb(28_25_23/0.2)] ring-2" : ""
      }`}
    >
      {winner && (
        <span className="border-safe-rule bg-safe-wash text-safe absolute -top-2.5 left-4 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
          Higher rated
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/protocol/${a.slug}`} className="hover:text-accent truncate text-lg font-semibold">
            {a.name}
          </Link>
          <p className="text-ink-3 tnum mt-0.5 truncate text-xs">
            {a.category} · {usd(a.tvl_usd)} · {a.chain_count}{" "}
            {a.chain_count === 1 ? "chain" : "chains"} · {age(a.age_days)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <ScoreMark score={a.overall_score} verdict={a.verdict} size="sm" />
          <div className="mt-1 flex justify-end">
            <VerdictBadge verdict={a.verdict} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Side({ score, align }: { score: number; align: "left" | "right" }) {
  const tone = scoreTone(score);
  return (
    <div className={`flex items-center gap-2.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span className={`tnum w-7 text-sm font-semibold ${tone.fg} ${align === "right" ? "text-left" : "text-right"}`}>
        {score}
      </span>
      <span className="bg-wash h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <span
          className={`block h-full rounded-full ${tone.bar}`}
          style={{
            width: `${Math.max(score, 1.5)}%`,
            marginLeft: align === "right" ? `${100 - Math.max(score, 1.5)}%` : undefined,
          }}
        />
      </span>
    </div>
  );
}

function Evidence({ a }: { a: Assessment }) {
  return (
    <dl className="card space-y-2 px-5 py-4 text-xs">
      <Row k="Share of peak" v={a.has_tvl_history ? `${a.tvl_pct_of_peak}%` : "—"} />
      <Row k="Peak TVL" v={usd(a.peak_tvl_usd)} />
      <Row k="30-day change" v={a.has_tvl_history ? pct(a.tvl_change_30d_pct, true) : "—"} />
      <Row k="Audit evidence" v={a.audit_status.toLowerCase()} />
      <Row k="Content hash" v={a.content_hash} mono />
    </dl>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3 shrink-0">{k}</dt>
      <dd className={`tnum min-w-0 truncate text-right font-medium ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </dd>
    </div>
  );
}

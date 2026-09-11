import Link from "next/link";
import { VerdictBadge, ScoreMark } from "./verdict-badge";
import { DimensionBars } from "./dimension-bars";
import { usd, pct, ago, verdictTone } from "@/lib/format";
import type { Assessment } from "@/lib/types";

/**
 * The tearsheet. One protocol, its grade, what the grade was made of, and when.
 *
 * The verdict-coloured edge on the left is the only structural use of colour in
 * the design — it works like a ledger tab, so a page of these is scannable by
 * grade without reading a word.
 */
export function RatingCard({
  a,
  animate = false,
  href,
}: {
  a: Assessment;
  animate?: boolean;
  href?: string;
}) {
  const tone = verdictTone(a.verdict);
  const body = (
    <article className={`card-raised ${tone.tab} overflow-hidden`}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg leading-tight font-semibold">{a.name}</h3>
          <p className="text-ink-3 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="bg-wash border-rule rounded border px-1.5 py-0.5 font-medium">
              {a.category || "uncategorised"}
            </span>
            <span className="tnum">{usd(a.tvl_usd)} TVL</span>
            <span className="tnum">{a.chain_count} {a.chain_count === 1 ? "chain" : "chains"}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <ScoreMark score={a.overall_score} verdict={a.verdict} />
          <div className="mt-1.5 flex justify-end">
            <VerdictBadge verdict={a.verdict} size="sm" />
          </div>
        </div>
      </div>

      <div className="border-rule border-t px-5 py-4">
        <DimensionBars assessment={a} compact animate={animate} />
      </div>

      <div className="border-rule text-ink-3 flex items-center justify-between gap-3 border-t px-5 py-2.5 text-xs">
        <span className="tnum">
          {a.has_tvl_history ? (
            <>
              {a.tvl_pct_of_peak}% of peak · {pct(a.tvl_change_30d_pct, true)} in 30d
            </>
          ) : (
            "no TVL history"
          )}
        </span>
        <span>{ago(a.analyzed_at)}</span>
      </div>
    </article>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      className="focus-visible:outline-accent block rounded-xl transition-shadow hover:shadow-[0_1px_2px_rgb(28_25_23/0.05),0_12px_32px_-14px_rgb(28_25_23/0.18)]"
    >
      {body}
    </Link>
  );
}

/** A compact row for tables and lists — flat, not a card, because a page of
 *  twenty identical cards is a page nobody can scan. */
export function RatingRow({ a }: { a: Assessment }) {
  const tone = verdictTone(a.verdict);
  return (
    <Link
      href={`/protocol/${a.slug}`}
      className="border-rule hover:bg-wash group flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
    >
      <span className={`h-8 w-0.5 shrink-0 rounded-full ${tone.bar}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="group-hover:text-accent block truncate text-sm font-medium">
          {a.name}
        </span>
        <span className="text-ink-3 block truncate text-xs">{a.category}</span>
      </span>
      <span className="tnum text-ink-2 hidden shrink-0 text-sm sm:block">{usd(a.tvl_usd)}</span>
      <span className="shrink-0">
        <VerdictBadge verdict={a.verdict} size="sm" />
      </span>
      <span className={`tnum w-10 shrink-0 text-right text-sm font-semibold ${tone.fg}`}>
        {a.verdict === "UNKNOWN" ? "—" : a.overall_score}
      </span>
    </Link>
  );
}

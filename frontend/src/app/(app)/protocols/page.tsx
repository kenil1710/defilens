import type { Metadata } from "next";
import Link from "next/link";
import { getProtocolsResult, getStats, getRecent } from "@/lib/oracle";
import { ProtocolCards } from "@/components/protocol-cards";
import { CATEGORY_GROUPS } from "@/lib/categories";
import { ORACLE_ADDRESS, addressUrl } from "@/lib/genlayer";

export const metadata: Metadata = {
  title: "Scored protocols — DeFiLens",
  description:
    "Every protocol DeFiLens has rated, with its verdict, score, TVL and category. Filter by verdict or category and sort by score, TVL or recency.",
};

export const revalidate = 120;

export default async function ProtocolsPage() {
  /*
   * Three reads, not twenty-five.
   *
   * `get_protocols` carries the headline numbers but not the chain list, and
   * the cards show chains. `get_recent` returns WHOLE assessments, so one call
   * supplies the chains for every protocol in the index — where fetching each
   * protocol individually would spend Studio's whole per-minute budget on a
   * single page render.
   */
  const [{ ok, protocols }, stats, recent] = await Promise.all([
    getProtocolsResult(100),
    getStats(),
    getRecent(60),
  ]);

  const chainsBySlug: Record<string, string[]> = {};
  for (const a of recent) {
    if (!chainsBySlug[a.slug] && Array.isArray(a.chains)) chainsBySlug[a.slug] = a.chains;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Scored protocols</h1>
      <p className="text-ink-2 mt-3 max-w-[62ch] leading-relaxed">
        Every protocol this oracle has rated. Each one is a consensus result:
        five validators fetched the same public data independently and agreed on
        every number in it before anything was written.
      </p>

      {/* The stat strip lives HERE rather than on the landing page — a visitor
          who has navigated to the index is asking about coverage, and a visitor
          who has just arrived is not. */}
      {stats && (
        <dl className="border-rule bg-wash/50 mt-7 grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-4">
          <Stat label="Protocols scored" value={stats.protocols_tracked} />
          <Stat label="Assessments on chain" value={stats.total_analyzed} />
          <Stat label="Average score" value={stats.average_score} />
          <Stat label="Rated safe" value={stats.verdicts?.SAFE ?? 0} />
        </dl>
      )}

      <div className="mt-8">
        {!ok ? (
          <div className="border-moderate-rule bg-moderate-wash rounded-xl border px-4 py-14 text-center">
            <p className="font-semibold">The oracle did not answer just now</p>
            <p className="text-ink-2 mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed">
              GenLayer Studio meters how often a single caller may read a
              contract, and this page has hit that limit. The ratings are still
              on chain and nothing has been lost — reload in a minute.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a
                href={addressUrl(ORACLE_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold"
              >
                Read it on the explorer
              </a>
            </div>
          </div>
        ) : protocols.length === 0 ? (
          <div className="card px-4 py-16 text-center">
            <p className="font-semibold">Nothing rated yet</p>
            <p className="text-ink-3 mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed">
              The oracle is deployed and answering — it just has no ratings in it
              so far. Putting the first protocol through takes about thirty
              seconds and costs nothing.
            </p>
            <Link
              href="/analyze"
              className="bg-accent hover:bg-accent-dark mt-5 inline-block rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            >
              Analyze a protocol
            </Link>
          </div>
        ) : (
          <ProtocolCards
            protocols={protocols}
            categoryGroups={CATEGORY_GROUPS}
            chainsBySlug={chainsBySlug}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dd className="tnum text-2xl font-bold tracking-tight">{value}</dd>
      <dt className="text-ink-3 mt-0.5 text-xs">{label}</dt>
    </div>
  );
}

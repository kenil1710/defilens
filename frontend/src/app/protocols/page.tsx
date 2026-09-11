import type { Metadata } from "next";
import { getProtocols, getStats } from "@/lib/oracle";
import { ProtocolTable } from "@/components/protocol-table";

export const metadata: Metadata = {
  title: "All ratings — DeFiLens",
  description: "Every protocol DeFiLens has rated, with its verdict, score and TVL.",
};

export const revalidate = 30;

export default async function ProtocolsPage() {
  const [protocols, stats] = await Promise.all([getProtocols(100), getStats()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ratings</h1>
          <p className="text-ink-2 mt-2 max-w-[56ch] leading-relaxed">
            Every protocol this oracle has scored. Each row is a consensus result:
            five validators fetched the same public data and agreed on every
            number in it.
          </p>
        </div>
        {stats && (
          <dl className="flex gap-8">
            <div>
              <dd className="tnum text-2xl font-bold">{stats.protocols_tracked}</dd>
              <dt className="text-ink-3 text-xs">Protocols</dt>
            </div>
            <div>
              <dd className="tnum text-2xl font-bold">{stats.total_analyzed}</dd>
              <dt className="text-ink-3 text-xs">Assessments</dt>
            </div>
            <div>
              <dd className="tnum text-2xl font-bold">{stats.average_score}</dd>
              <dt className="text-ink-3 text-xs">Average</dt>
            </div>
          </dl>
        )}
      </div>

      <div className="mt-8">
        <ProtocolTable protocols={protocols} />
      </div>
    </div>
  );
}

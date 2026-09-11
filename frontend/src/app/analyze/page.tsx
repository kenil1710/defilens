import type { Metadata } from "next";
import Link from "next/link";
import { AnalyzeForm } from "@/components/analyze-form";
import { getProtocols, getStats } from "@/lib/oracle";
import { VerdictBadge } from "@/components/verdict-badge";

export const metadata: Metadata = {
  title: "Rate a protocol — DeFiLens",
  description:
    "Name any protocol DeFi Llama tracks. Five validators fetch it independently and have to agree before a rating is stored.",
};

export const revalidate = 30;

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const [protocols, stats] = await Promise.all([getProtocols(12), getStats()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:gap-16">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rate a protocol
          </h1>
          <p className="text-ink-2 mt-3 max-w-[56ch] leading-relaxed">
            Five validators will each fetch DeFi Llama independently, reduce what
            they find to the same sixteen integers, and score those integers with
            the same arithmetic. If any two disagree, nothing is written.
          </p>

          <div className="mt-8">
            <AnalyzeForm initialSlug={slug ?? ""} />
          </div>

          <div className="border-rule mt-12 border-t pt-8">
            <h2 className="font-semibold">What happens to your submission</h2>
            <ul className="text-ink-2 mt-3 max-w-[62ch] space-y-2.5 text-sm leading-relaxed">
              <li>
                <span className="text-ink font-medium">It costs nothing.</span>{" "}
                The fee is zero on this testnet, and the method is payable anyway
                so that the refund path is exercised rather than assumed.
              </li>
              <li>
                <span className="text-ink font-medium">
                  One protocol every 15 minutes.
                </span>{" "}
                A protocol already rated in the last {stats ? "15" : "15"} minutes
                is refused with a reason, not silently re-run.
              </li>
              <li>
                <span className="text-ink font-medium">
                  A refusal is not an error.
                </span>{" "}
                Unknown names, rate limits and a DeFi Llama outage all come back
                as a successful transaction carrying a reason — the contract
                never reverts once value is attached.
              </li>
            </ul>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="card px-4 py-4">
            <h2 className="text-sm font-semibold">Try one of these</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["aave-v3", "uniswap-v3", "lido", "curve-dex", "gmx", "pendle", "across", "stargate"].map((s) => (
                <Link
                  key={s}
                  href={`/analyze?slug=${s}`}
                  className="border-rule-2 hover:border-accent hover:text-accent rounded-md border bg-white px-2 py-1 font-mono text-xs"
                >
                  {s}
                </Link>
              ))}
            </div>
          </section>

          {protocols.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-rule border-b px-4 py-3 text-sm font-semibold">
                Recently rated
              </h2>
              <ul>
                {protocols.slice(0, 8).map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/protocol/${p.slug}`}
                      className="border-rule hover:bg-wash flex items-center justify-between gap-2 border-b px-4 py-2.5 last:border-b-0"
                    >
                      <span className="min-w-0 truncate text-sm">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <VerdictBadge verdict={p.verdict} size="sm" />
                        <span className="tnum text-ink-2 w-6 text-right text-sm font-semibold">
                          {p.verdict === "UNKNOWN" ? "—" : p.overall_score}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

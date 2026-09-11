import Link from "next/link";
import { ORACLE_ADDRESS, CONSUMER_ADDRESS, addressUrl, EXPLORER } from "@/lib/genlayer";
import { shortHash } from "@/lib/format";

export function SiteFooter() {
  return (
    <footer className="border-rule mt-20 border-t">
      <div className="text-ink-3 mx-auto max-w-6xl px-4 py-8 text-xs sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-sm">
            <p className="text-ink font-semibold">DeFiLens</p>
            <p className="mt-1.5 leading-relaxed">
              A risk rating any contract can read. Scores come from DeFi Llama&apos;s
              public data, agreed by five independent GenLayer validators, and can
              be recomputed from the evidence stored alongside them.
            </p>
            <p className="mt-2.5 leading-relaxed">
              Testnet software on a testnet. A rating is a reading of public data,
              not financial advice, and a high score is not a guarantee of anything.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-1.5">
            <div className="space-y-1.5">
              <Link href="/docs" className="hover:text-accent block">Methodology</Link>
              <Link href="/docs#integrate" className="hover:text-accent block">Integration</Link>
              <Link href="/protocols" className="hover:text-accent block">All ratings</Link>
              <Link href="/compare" className="hover:text-accent block">Compare</Link>
            </div>
            <div className="space-y-1.5">
              <a href={addressUrl(ORACLE_ADDRESS)} target="_blank" rel="noreferrer"
                className="hover:text-accent block">
                Oracle <span className="font-mono">{shortHash(ORACLE_ADDRESS, 6)}</span>
              </a>
              <a href={addressUrl(CONSUMER_ADDRESS)} target="_blank" rel="noreferrer"
                className="hover:text-accent block">
                Consumer <span className="font-mono">{shortHash(CONSUMER_ADDRESS, 6)}</span>
              </a>
              <a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-accent block">
                Explorer
              </a>
              <a href="https://api.llama.fi/protocols" target="_blank" rel="noreferrer"
                className="hover:text-accent block">
                Data source
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

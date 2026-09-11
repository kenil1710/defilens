import Link from "next/link";
import { ORACLE_ADDRESS, CONSUMER_ADDRESS, addressUrl, EXPLORER } from "@/lib/genlayer";
import { GITHUB, CHAIN } from "@/lib/chain";
import { shortHash } from "@/lib/format";

const PRODUCT = [
  { href: "/analyze", label: "Analyze a protocol" },
  { href: "/protocols", label: "Scored protocols" },
  { href: "/compare", label: "Compare" },
];

const LEARN = [
  { href: "/docs#start", label: "Getting started" },
  { href: "/docs#dimensions", label: "Methodology" },
  { href: "/docs#integrate", label: "Integration guide" },
  { href: "/docs#faq", label: "Questions" },
];

export function SiteFooter() {
  return (
    <footer className="border-rule mt-20 border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-2">
              <Lens />
              <span className="text-[15px] font-bold tracking-tight">DeFiLens</span>
            </div>
            <p className="text-ink-3 mt-3 max-w-[38ch] text-sm leading-relaxed">
              On-chain risk ratings for DeFi protocols, agreed by five independent
              validators and verifiable from the evidence stored beside them.
            </p>
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
              className="border-rule-2 text-ink-2 hover:border-accent hover:text-accent mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
            >
              <GitHubMark />
              Source on GitHub
            </a>
          </div>

          <FooterCol title="Product">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-accent block">
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Learn">
            {LEARN.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-accent block">
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="On chain">
            <li>
              <a href={addressUrl(ORACLE_ADDRESS)} target="_blank" rel="noreferrer" className="hover:text-accent block">
                Oracle <span className="font-mono">{shortHash(ORACLE_ADDRESS, 6)}</span>
              </a>
            </li>
            <li>
              <a href={addressUrl(CONSUMER_ADDRESS)} target="_blank" rel="noreferrer" className="hover:text-accent block">
                Consumer <span className="font-mono">{shortHash(CONSUMER_ADDRESS, 6)}</span>
              </a>
            </li>
            <li>
              <a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-accent block">
                Block explorer
              </a>
            </li>
            <li>
              <a href="https://api.llama.fi/protocols" target="_blank" rel="noreferrer" className="hover:text-accent block">
                Data source
              </a>
            </li>
          </FooterCol>
        </div>

        <div className="border-rule text-ink-3 mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-xs">
          <p>
            {CHAIN.name} · chain <span className="tnum">{CHAIN.id}</span>
          </p>
          <p className="max-w-[62ch] leading-relaxed">
            Testnet software on a testnet. A rating is a reading of public data,
            not financial advice, and a high score is not a guarantee of anything.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-ink text-xs font-semibold">{title}</p>
      <ul className="text-ink-3 mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function Lens() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="9.5" cy="9.5" r="7" stroke="#1c1917" strokeWidth="1.6" />
      <path d="M14.8 14.8 L20 20" stroke="#1c1917" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 11.5 L8.3 8.2 L10.6 10.4 L13.4 6.2" stroke="#2563eb" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

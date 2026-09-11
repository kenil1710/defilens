import Link from "next/link";
import { CHAIN } from "@/lib/genlayer";

const NAV = [
  { href: "/analyze", label: "Analyze" },
  { href: "/protocols", label: "Protocols" },
  { href: "/compare", label: "Compare" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  return (
    <header className="border-rule bg-paper/85 sticky top-0 z-40 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Lens />
          <span className="text-[15px] font-bold tracking-tight">DeFiLens</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-2 hover:bg-wash hover:text-ink shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="border-rule text-ink-3 hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:inline-flex">
          <span className="bg-safe size-1.5 rounded-full" aria-hidden />
          GenLayer Studio Dev
          <span className="text-ink-4 tnum">#{CHAIN.id}</span>
        </span>
      </div>
    </header>
  );
}

/** The mark: a lens over a falling-then-rising line. Drawn rather than
 *  imported so it inherits the type colour and needs no asset. */
function Lens() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="9.5" cy="9.5" r="7" stroke="#1c1917" strokeWidth="1.6" />
      <path d="M14.8 14.8 L20 20" stroke="#1c1917" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 11.5 L8.3 8.2 L10.6 10.4 L13.4 6.2" stroke="#2563eb" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WalletBadge } from "./wallet-badge";

const NAV = [
  { href: "/analyze", label: "Analyze" },
  { href: "/protocols", label: "Protocols" },
  { href: "/compare", label: "Compare" },
  { href: "/docs", label: "Docs" },
];

/**
 * The header knows which page it is on, and shows less on the landing page.
 *
 * A marketing page that opens with a chain id and a Connect button is asking a
 * visitor to make a commitment before it has told them what the product does.
 * The wallet and the network belong on the pages where they mean something —
 * everywhere a visitor can actually call the oracle.
 */
export function SiteHeader({ variant }: { variant: "marketing" | "app" }) {
  // The variant arrives from the SERVER, via which route group rendered this.
  // It was previously derived from usePathname(), which is not resolved during
  // prerendering — so the static HTML for the landing page shipped the app
  // header and only corrected itself once React hydrated.
  const isLanding = variant === "marketing";
  // usePathname is still used, but ONLY to mark the active nav item: a null
  // pathname there costs a highlight for one frame and nothing else.
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  return (
    <header className="border-rule bg-paper/85 sticky top-0 z-40 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" onClick={() => setOpen(false)}>
          <Lens />
          <span className="text-[15px] font-bold tracking-tight">DeFiLens</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-wash text-ink" : "text-ink-2 hover:bg-wash hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isLanding ? (
            <Link
              href="/analyze"
              className="bg-accent hover:bg-accent-dark hidden rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white transition-colors sm:block"
            >
              Analyze a protocol
            </Link>
          ) : (
            <WalletBadge />
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
            className="border-rule-2 hover:bg-wash rounded-md border p-1.5 sm:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              {open ? (
                <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="#1c1917" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="#1c1917" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-rule bg-paper border-t sm:hidden">
          <div className="mx-auto max-w-6xl px-4 py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-ink-2 hover:bg-wash block rounded-md px-2 py-2.5 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
            {isLanding && (
              <Link
                href="/analyze"
                onClick={() => setOpen(false)}
                className="bg-accent mt-1 block rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-white"
              >
                Analyze a protocol
              </Link>
            )}
          </div>
        </nav>
      )}
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

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * The public face. No wallet control, no chain id — a page that opens by asking
 * for a connection is asking for a commitment before it has said what the
 * product does.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader variant="marketing" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * Every page where a visitor can actually reach the oracle. Here the wallet
 * control and the network badge mean something, so here is where they appear.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader variant="app" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
